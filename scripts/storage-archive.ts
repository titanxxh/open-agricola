import { spawn, execFile } from 'node:child_process'
import { dockerBindUser } from './ci/docker-bind-user'
import { createHash, randomUUID } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { mkdir, readFile, readdir, writeFile, stat, lstat, mkdtemp, rm, chmod } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { PostgresDatabase } from '../server/database/postgres'
import { ErasureLedger, type ErasureBatch } from '../server/storage/erasure-ledger'
import { objectHash, S3ObjectStore } from '../server/storage/s3-store'
import { validateBatch } from '../server/storage/replay-removal-ledger'
import { withResourceCapture, type CapturedResource } from '../server/storage/backup-coordination'

export const POSTGRES_IMAGE = 'postgres:18-bookworm@sha256:3725f4e2499eef5134592b3b4ab79a543ed7f8e533b05b5b637af926630f6650'
type ArchivedObject = { key: string; sha256: string; size: number; contentType: string }
type DumpFile = { name: string; sha256: string; size: number }
/**
 * Version 1 holds one compressed custom-format dump. Version 2 holds an
 * uncompressed directory-format dump whose per-table files stay byte-stable
 * between captures, so an rsync copy transfers only what changed.
 */
export type StorageArchive = {
  version: 1 | 2; sourceBuildId: string; createdAt: string; schema: string
  database: { sha256: string; size: number; format?: 'directory'; files?: DumpFile[] }; objects: ArchivedObject[]
}
export type DatabaseDumpFormat = 'custom' | 'directory'
const DUMP_FILE = /^(?:toc\.dat|[0-9]+\.dat)$/

/** One digest over the sorted file list binds a directory dump as a whole. */
export function directoryDumpDigest(files: readonly DumpFile[]): { sha256: string; size: number } {
  const sorted = [...files].sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0)
  const hash = createHash('sha256')
  for (const file of sorted) hash.update(`${file.name}\t${file.sha256}\t${file.size}\n`)
  return { sha256: hash.digest('hex'), size: sorted.reduce((total, file) => total + file.size, 0) }
}

/** Lists a directory dump as regular files only; anything else is refused. */
async function directoryDumpFiles(path: string): Promise<DumpFile[]> {
  const files: DumpFile[] = []
  for (const name of (await readdir(path)).sort()) {
    const info = await lstat(join(path, name))
    if (!info.isFile() || !DUMP_FILE.test(name)) throw new Error('Database archive integrity failure')
    files.push({ name, ...await digest(join(path, name)) })
  }
  return files
}

/** Checks the dump named by the manifest and returns the path pg_restore reads inside /archive. */
export async function verifiedDump(root: string, manifest: StorageArchive): Promise<string> {
  if (manifest.version === 1) {
    const actual = await digest(join(root, 'database.dump'))
    if (actual.sha256 !== manifest.database.sha256 || actual.size !== manifest.database.size) throw new Error('Database archive integrity failure')
    return '/archive/database.dump'
  }
  const expected = manifest.database.files
  if (manifest.database.format !== 'directory' || !Array.isArray(expected)) throw new Error('Invalid storage archive manifest')
  const actual = await directoryDumpFiles(join(root, 'database'))
  const summary = directoryDumpDigest(actual)
  if (JSON.stringify(actual) !== JSON.stringify([...expected].sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
    || summary.sha256 !== manifest.database.sha256 || summary.size !== manifest.database.size) throw new Error('Database archive integrity failure')
  return '/archive/database'
}

async function digest(path: string): Promise<{ sha256: string; size: number }> {
  const hash = createHash('sha256')
  for await (const bytes of createReadStream(path)) hash.update(bytes)
  return { sha256: hash.digest('hex'), size: (await stat(path)).size }
}

export async function pgTool(tool: 'pg_dump' | 'pg_restore', connectionString: string, root: string, args: string[], signal?: AbortSignal, deadlineEpochMs?: number, listFile?: string): Promise<string> {
  signal?.throwIfAborted()
  const local = process.env.PG_CLIENT_MODE === 'local'
  const url = new URL(connectionString)
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) throw new Error('Expected a PostgreSQL connection URL')
  const parameters = new Map<string, string>([
    ['host', url.hostname.replace(/^\[|\]$/g, '')], ['port', url.port || '5432'],
    ['dbname', decodeURIComponent(url.pathname.slice(1))],
    ['user', decodeURIComponent(url.username)], ['password', decodeURIComponent(url.password)],
    ...url.searchParams,
  ])
  // A private libpq service file preserves URL options without credentials in
  // argv, docker inspect, or the archive. Newlines cannot be represented here.
  for (const [key, value] of parameters) {
    if (!/^[a-z_]+$/.test(key) || /[\r\n]/.test(value)) throw new Error('Unsupported PostgreSQL service parameter')
  }
  const config = await mkdtemp(join(tmpdir(), 'agricola-pg-client-'))
  const container = `agricola-${tool.replace('_', '-')}-${randomUUID()}`
  let launched = false
  try {
    await writeFile(join(config, 'service.conf'), '[archive]\n' + [...parameters].map(([key, value]) => `${key}=${value}`).join('\n') + '\n', { mode: 0o600 })
    signal?.throwIfAborted()
    const deadline = deadlineEpochMs ?? Number(process.env.BACKUP_DEADLINE_EPOCH_MS || 0)
    if (deadline && deadline <= Date.now()) throw new Error('Backup deadline exceeded')
    const command = deadline ? ['timeout', '--signal=TERM', '--kill-after=3s', String(Math.max(1, Math.ceil((deadline - Date.now()) / 1000))), tool] : [tool]
    const argv = local ? args.map(arg => arg.replace('/archive/', `${resolve(root)}/`).replace('/archive-restore.list', listFile ?? '/archive-restore.list')) : [
      'run', '--rm', '--mount', 'type=volume,target=/var/lib/postgresql,volume-nocopy', '--name', container, '--label', `org.open-agricola.backup.run=${process.env.BACKUP_JOB_ID || container}`,
      '--label', `org.open-agricola.backup.deadline=${deadline || 0}`,
      '--network', 'host', '--env', 'PGSERVICEFILE=/connection/service.conf',
      '--user', dockerBindUser(),
      '--mount', `type=bind,source=${config},target=/connection,readonly`,
      '--mount', `type=bind,source=${resolve(root)},target=/archive${tool === 'pg_restore' ? ',readonly' : ''}`,
      ...(listFile ? ['--mount', `type=bind,source=${listFile},target=/archive-restore.list,readonly`] : []), POSTGRES_IMAGE, ...command, ...args,
    ]
    if (!args.includes('--list')) argv.push('--dbname=service=archive')
    return await new Promise<string>((done, reject) => {
      launched = true
      const child = spawn(local ? tool : 'docker', argv, { env: { ...process.env, PGSERVICEFILE: join(config, 'service.conf') }, stdio: ['ignore', 'pipe', 'pipe'] })
      let error = '', output = '', failed: Error | undefined
      let force: ReturnType<typeof setTimeout> | undefined
      const abort = () => {
        child.kill('SIGTERM')
        force = setTimeout(() => child.kill('SIGKILL'), 2000)
        force.unref()
      }
      signal?.addEventListener('abort', abort, { once: true })
      if (signal?.aborted) abort()
      child.stdout.on('data', (chunk: Buffer) => { output += chunk.toString() })
      child.stderr.on('data', (chunk: Buffer) => { if (error.length < 16000) error += chunk.toString() })
      child.once('error', cause => { failed = cause })
      child.once('close', code => {
        if (force) clearTimeout(force)
        signal?.removeEventListener('abort', abort)
        if (signal?.aborted) reject(signal.reason)
        else if (failed) reject(failed)
        else if (code === 0) done(output)
        else reject(new Error(`${tool} failed: ${error.trim() || code}`))
      })
    })
  } finally {
    if (!local && launched) await new Promise<void>(done => execFile('docker', ['rm', '-f', container], { timeout: 5000 }, () => done()))
    await rm(config, { recursive: true, force: true })
  }
}

type ArchiveExport = {
  connectionString: string; db: PostgresDatabase; objects: S3ObjectStore; root: string; sourceBuildId: string; signal: AbortSignal
  databaseFormat?: DatabaseDumpFormat
} & ({ mode: 'maintenance'; deadlineEpochMs?: number } | { mode: 'online'; deadlineEpochMs: number })

/** A fixed recovery point includes native database bytes and immutable private resources. */
export async function exportStorageArchive(request: ArchiveExport): Promise<StorageArchive> {
  const { connectionString, db, objects, root, sourceBuildId } = request
  if (!sourceBuildId) throw new Error('Source build identity is required')
  request.signal.throwIfAborted()
  const schema = (await db.prepare('SELECT current_schema() AS schema').get<{ schema: string }>())!.schema
  const capture = async (view: { kind: 'maintenance' } | { kind: 'online'; snapshotId: string; resources: CapturedResource[]; signal: AbortSignal }) => {
    const signal = view.kind === 'online' ? view.signal : request.signal
    signal.throwIfAborted()
    await mkdir(join(root, 'objects'), { recursive: true, mode: 0o700 })
    const directory = request.databaseFormat === 'directory'
    const dump = join(root, directory ? 'database' : 'database.dump')
    const args = directory
      ? ['--format=directory', '--compress=0', '--no-owner', '--no-acl', `--schema=${schema}`, '--file=/archive/database']
      : ['--format=custom', '--no-owner', '--no-acl', `--schema=${schema}`, '--file=/archive/database.dump']
    if (view.kind === 'online') args.push(`--snapshot=${view.snapshotId}`)
    await pgTool('pg_dump', connectionString, root, args, signal, request.deadlineEpochMs)
    if (directory) {
      await chmod(dump, 0o700)
      for (const name of await readdir(dump)) await chmod(join(dump, name), 0o600)
    } else await chmod(dump, 0o600)
    const catalog = view.kind === 'online' ? view.resources : await db.prepare(
      "SELECT object_key, content_hash AS sha256, size_bytes, content_type, state FROM stored_objects WHERE NOT blocked AND state IN ('ready','staging') ORDER BY object_key").all<CapturedResource>()
    const archived: ArchivedObject[] = []
    const ledger = new ErasureLedger(objects)
    for (const item of catalog) {
      signal.throwIfAborted()
      if (await ledger.isHashRemoved(item.sha256)) continue
      const object = await objects.get(item.object_key, signal)
      if (!object && item.state === 'staging') continue
      if (!object) throw new Error(`Backup object is missing: ${item.object_key}`)
      if (objectHash(object.body) !== item.sha256 || object.body.length !== item.size_bytes) throw new Error(`Backup object integrity failure: ${item.object_key}`)
      await writeFile(join(root, 'objects', item.sha256), object.body, { mode: 0o600 })
      archived.push({ key: item.object_key, sha256: item.sha256, size: item.size_bytes, contentType: item.content_type })
    }
    signal.throwIfAborted()
    const files = directory ? await directoryDumpFiles(dump) : null
    const database = files ? { ...directoryDumpDigest(files), format: 'directory' as const, files } : await digest(dump)
    signal.throwIfAborted()
    const manifest: StorageArchive = { version: files ? 2 : 1, sourceBuildId, createdAt: new Date().toISOString(), schema, database, objects: archived }
    await writeFile(join(root, 'archive.json'), JSON.stringify(manifest, null, 2) + '\n', { mode: 0o600 })
    signal.throwIfAborted()
    return manifest
  }
  if (request.mode === 'online') return withResourceCapture({ connectionString, schema, buildId: sourceBuildId,
    deadlineEpochMs: request.deadlineEpochMs, signal: request.signal }, (view, signal) => capture({ kind: 'online', ...view, signal }))
  if (await db.prepare("SELECT 1 FROM app_instances WHERE status!='stopped' AND lease_until>(extract(epoch FROM clock_timestamp())*1000)::bigint LIMIT 1").get()) throw new Error('Stop all applications before exporting storage')
  return capture({ kind: 'maintenance' })
}

/**
 * Read-only integrity check of a copied archive directory: the manifest's dump
 * and every listed object must be present with their recorded digests.
 */
export async function verifyStorageArchive(root: string): Promise<StorageArchive> {
  const manifest = JSON.parse(await readFile(join(root, 'archive.json'), 'utf8')) as StorageArchive
  if (![1, 2].includes(manifest.version) || !Array.isArray(manifest.objects)) throw new Error('Invalid storage archive manifest')
  await verifiedDump(root, manifest)
  const seen = new Set<string>()
  for (const item of manifest.objects) {
    // The same identity rules as restore: a malformed entry rejects the copy instead of being skipped.
    if (!/^[a-f0-9]{64}$/.test(item.sha256) || !Number.isSafeInteger(item.size) || item.size < 0
      || typeof item.key !== 'string' || !/^(card-art|replay-assets|replay-viewers)\//.test(item.key)) throw new Error('Invalid object archive identity')
    if (seen.has(item.sha256)) continue
    seen.add(item.sha256)
    const actual = await digest(join(root, 'objects', item.sha256)).catch(() => null)
    if (!actual || actual.sha256 !== item.sha256 || actual.size !== item.size) throw new Error(`Object archive integrity failure: ${item.key}`)
  }
  return manifest
}

export function decodeLedger(raw: string): ErasureBatch[] {
  const value: unknown = JSON.parse(raw)
  if (!value || typeof value !== 'object' || !('version' in value) || value.version !== 1 || !('batches' in value) || !Array.isArray(value.batches)) throw new Error('Invalid independent erasure ledger')
  return value.batches.map(validateBatch)
}

/** Union deletion facts. Neither restores nor offsite sync may replace a newer ledger. */
export async function mergeLedger(objects: S3ObjectStore, batches: ErasureBatch[]): Promise<void> {
  const ledger = new ErasureLedger(objects)
  const known = new Set((await ledger.read()).map(batch => JSON.stringify(validateBatch(batch))))
  for (const raw of batches) {
    const batch = validateBatch(raw), key = JSON.stringify(batch)
    if (known.has(key)) continue
    await ledger.append(batch); known.add(key)
  }
}

/** Read-only new-install admission, before any application migration or ledger write. */
export async function assertEmptyStorage(db: PostgresDatabase, objects: S3ObjectStore): Promise<void> {
  if (await db.prepare(`SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname NOT LIKE 'pg_toast%'
      AND c.relkind IN ('r','p','v','m','S','f') LIMIT 1`).get()) throw new Error('Bootstrap requires an empty target database')
  await objects.assertEmpty()
}
