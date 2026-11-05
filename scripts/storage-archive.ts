import { spawn, execFile } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { mkdir, readFile, writeFile, stat, mkdtemp, rm, chmod } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { PostgresDatabase } from '../server/database/postgres'
import { ResourceStore } from '../server/storage/resource-store'
import { ErasureLedger, type ErasureBatch } from '../server/storage/erasure-ledger'
import { objectHash, S3ObjectStore } from '../server/storage/s3-store'
import { applyReplayRemovalLedger, validateBatch } from '../server/game/replay-removal'
import { validateStorage } from './storage-validation'
import { migratePostgres } from '../server/database/migrations'
import { withResourceCapture, type CapturedResource } from '../server/storage/backup-coordination'

const POSTGRES_IMAGE = 'postgres:18-bookworm@sha256:3725f4e2499eef5134592b3b4ab79a543ed7f8e533b05b5b637af926630f6650'
type ArchivedObject = { key: string; sha256: string; size: number; contentType: string }
export type StorageArchive = {
  version: 1; sourceBuildId: string; createdAt: string; schema: string
  database: { sha256: string; size: number }; objects: ArchivedObject[]
}

async function digest(path: string): Promise<{ sha256: string; size: number }> {
  const hash = createHash('sha256')
  for await (const bytes of createReadStream(path)) hash.update(bytes)
  return { sha256: hash.digest('hex'), size: (await stat(path)).size }
}

async function pgTool(tool: 'pg_dump' | 'pg_restore', connectionString: string, root: string, args: string[], signal?: AbortSignal, deadlineEpochMs?: number): Promise<string> {
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
  const config = await mkdtemp(join(resolve(root), '.pg-client-'))
  const container = `agricola-${tool.replace('_', '-')}-${randomUUID()}`
  let launched = false
  try {
    await writeFile(join(config, 'service.conf'), '[archive]\n' + [...parameters].map(([key, value]) => `${key}=${value}`).join('\n') + '\n', { mode: 0o600 })
    signal?.throwIfAborted()
    const deadline = deadlineEpochMs ?? Number(process.env.BACKUP_DEADLINE_EPOCH_MS || 0)
    if (deadline && deadline <= Date.now()) throw new Error('Backup deadline exceeded')
    const command = deadline ? ['timeout', '--signal=TERM', '--kill-after=3s', String(Math.max(1, Math.ceil((deadline - Date.now()) / 1000))), tool] : [tool]
    const argv = local ? args.map(arg => arg.replace('/archive/', `${resolve(root)}/`)) : [
      'run', '--rm', '--name', container, '--label', `org.open-agricola.backup.run=${process.env.BACKUP_JOB_ID || container}`,
      '--label', `org.open-agricola.backup.deadline=${deadline || 0}`,
      '--network', 'host', '--env', 'PGSERVICEFILE=/connection/service.conf',
      '--user', `${process.getuid?.() ?? 0}:${process.getgid?.() ?? 0}`,
      '--mount', `type=bind,source=${config},target=/connection,readonly`,
      '--mount', `type=bind,source=${resolve(root)},target=/archive`, POSTGRES_IMAGE, ...command, ...args,
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
    const dump = join(root, 'database.dump')
    const args = ['--format=custom', '--no-owner', '--no-acl', `--schema=${schema}`, '--file=/archive/database.dump']
    if (view.kind === 'online') args.push(`--snapshot=${view.snapshotId}`)
    await pgTool('pg_dump', connectionString, root, args, signal, request.deadlineEpochMs)
    await chmod(dump, 0o600)
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
    const database = await digest(dump)
    signal.throwIfAborted()
    const manifest: StorageArchive = { version: 1, sourceBuildId, createdAt: new Date().toISOString(), schema, database, objects: archived }
    await writeFile(join(root, 'archive.json'), JSON.stringify(manifest, null, 2) + '\n', { mode: 0o600 })
    signal.throwIfAborted()
    return manifest
  }
  if (request.mode === 'online') return withResourceCapture({ connectionString, schema, buildId: sourceBuildId,
    deadlineEpochMs: request.deadlineEpochMs, signal: request.signal }, (view, signal) => capture({ kind: 'online', ...view, signal }))
  if (await db.prepare("SELECT 1 FROM app_instances WHERE status!='stopped' AND lease_until>(extract(epoch FROM clock_timestamp())*1000)::bigint LIMIT 1").get()) throw new Error('Stop all applications before exporting storage')
  return capture({ kind: 'maintenance' })
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

/** Restore into an EMPTY database. Caller supplies current, independent erasure facts. */
export async function restoreStorageArchive(connectionString: string, db: PostgresDatabase, objects: S3ObjectStore, root: string, currentErasureFacts: ErasureBatch[], signal?: AbortSignal) {
  signal?.throwIfAborted()
  const manifest = JSON.parse(await readFile(join(root, 'archive.json'), 'utf8')) as StorageArchive
  if (manifest.version !== 1 || !/^[a-z_][a-z0-9_]*$/.test(manifest.schema) || !Array.isArray(manifest.objects)) throw new Error('Invalid storage archive manifest')
  if (await db.prepare("SELECT 1 FROM information_schema.tables WHERE table_schema NOT IN ('pg_catalog','information_schema') LIMIT 1").get()) throw new Error('Restore requires an empty target database')
  const actual = await digest(join(root, 'database.dump'))
  if (actual.sha256 !== manifest.database.sha256 || actual.size !== manifest.database.size) throw new Error('Database archive integrity failure')
  const barrier = `restore:${manifest.database.sha256}`
  // The target stays detached from ingress until validation succeeds. The
  // durable barrier also prevents accidental startup after a failed restore.
  const record = async (status: 'importing' | 'validated' | 'failed', report: unknown = null) => {
    await db.prepare(`INSERT INTO data_imports(source_hash,status,report_json,updated_at) VALUES (?,?,?,?)
      ON CONFLICT(source_hash) DO UPDATE SET status=excluded.status,report_json=excluded.report_json,updated_at=excluded.updated_at`)
      .run(barrier, status, report === null ? null : JSON.stringify(report), Date.now())
  }
  const restoreList = `restore-${randomUUID()}.list`
  try {
    // Apply the CURRENT ledger before placing any historical bytes in the target.
    await mergeLedger(objects, currentErasureFacts)
    const ledger = new ErasureLedger(objects)
    for (const item of manifest.objects) {
      signal?.throwIfAborted()
      if (!/^[a-f0-9]{64}$/.test(item.sha256) || !Number.isSafeInteger(item.size) || item.size < 0
        || typeof item.key !== 'string' || !/^(card-art|replay-assets|replay-viewers)\//.test(item.key)) throw new Error('Invalid object archive identity')
      if (await ledger.isHashRemoved(item.sha256)) continue
      const body = await readFile(join(root, 'objects', item.sha256))
      if (objectHash(body) !== item.sha256 || body.length !== item.size) throw new Error(`Object archive integrity failure: ${item.key}`)
      await objects.putImmutable(item.key, body, item.contentType)
    }
    // pg_dump --schema omits extension definitions; citext lives in public for
    // every application schema. Use the PostgreSQL client's native restore.
    await db.exec('CREATE EXTENSION IF NOT EXISTS citext WITH SCHEMA public')
    const listing = await pgTool('pg_restore', connectionString, root, ['--list', '/archive/database.dump'], signal)
    // public already exists and owns citext in a fresh target database. Omit
    // only its schema-creation entry, keeping every application object.
    await writeFile(join(root, restoreList), listing.split('\n').filter(line => !/^\d+; \d+ \d+ SCHEMA - public /.test(line)).join('\n'), { mode: 0o600 })
    await pgTool('pg_restore', connectionString, root, [`--use-list=/archive/${restoreList}`, '--exit-on-error', '--single-transaction', '--no-owner', '--no-acl', '/archive/database.dump'], signal)
    await migratePostgres(db)
    // Restored routing leases belong to source processes. Detach them without
    // changing Room recovery, permanent identities or ownership fencing epochs.
    await db.transaction(async () => {
      await db.exec("UPDATE app_instances SET status='stopped', lease_until=0")
      await db.exec('UPDATE room_ownership SET lease_until=0, admission_until=0')
    })()
    await record('importing')
    const resources = new ResourceStore(db, objects)
    await applyReplayRemovalLedger(db, { resources })
    const validation = await validateStorage(db, resources)
    await record('validated', validation)
    return { manifest, validation }
  } catch (error) {
    // Native restore is transactional. If it failed before schema creation,
    // initialize the empty target only to leave a permanent startup barrier.
    await migratePostgres(db)
    await record('failed', { error: error instanceof Error ? error.message : 'Restore validation failed' })
    throw error
  } finally { await rm(join(root, restoreList), { force: true }) }
}
