import { spawn } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { mkdir, readFile, writeFile, stat, mkdtemp, rm, chmod } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { PostgresDatabase } from '../server/database/postgres'
import { ResourceStore } from '../server/storage/resource-store'
import { ErasureLedger, type ErasureBatch } from '../server/storage/erasure-ledger'
import { objectHash, S3ObjectStore } from '../server/storage/s3-store'
import { applyReplayRemovalLedger, validateBatch } from '../server/game/replay-removal'
import { validateStorage } from './storage-validation'
import { migratePostgres } from '../server/database/migrations'

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

async function pgTool(tool: 'pg_dump' | 'pg_restore', connectionString: string, root: string, args: string[]): Promise<string> {
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
  await writeFile(join(config, 'service.conf'), '[archive]\n' + [...parameters].map(([key, value]) => `${key}=${value}`).join('\n') + '\n', { mode: 0o600 })
  const argv = local ? args.map(arg => arg.replace('/archive/', `${resolve(root)}/`)) : [
    'run', '--rm', '--network', 'host', '--env', 'PGSERVICEFILE=/connection/service.conf',
    '--user', `${process.getuid?.() ?? 0}:${process.getgid?.() ?? 0}`,
    '--mount', `type=bind,source=${config},target=/connection,readonly`,
    '--mount', `type=bind,source=${resolve(root)},target=/archive`, POSTGRES_IMAGE, tool, ...args,
  ]
  if (!args.includes('--list')) argv.push('--dbname=service=archive')
  try {
    return await new Promise<string>((done, reject) => {
      const child = spawn(local ? tool : 'docker', argv, { env: { ...process.env, PGSERVICEFILE: join(config, 'service.conf') }, stdio: ['ignore', 'pipe', 'pipe'] })
      let error = '', output = ''
      child.stdout.on('data', (chunk: Buffer) => { output += chunk.toString() })
      child.stderr.on('data', (chunk: Buffer) => { if (error.length < 16000) error += chunk.toString() })
      child.once('error', reject)
      child.once('exit', code => code === 0 ? done(output) : reject(new Error(`${tool} failed: ${error.trim() || code}`)))
    })
  } finally { await rm(config, { recursive: true, force: true }) }
}

/** A maintenance backup captures the native database and private immutable bytes. */
export async function exportStorageArchive(connectionString: string, db: PostgresDatabase, objects: S3ObjectStore, root: string, sourceBuildId: string): Promise<StorageArchive> {
  if (!sourceBuildId) throw new Error('Source build identity is required')
  if (await db.prepare("SELECT 1 FROM app_instances WHERE status!='stopped' AND lease_until>(extract(epoch FROM clock_timestamp())*1000)::bigint LIMIT 1").get()) throw new Error('Stop all applications before exporting storage')
  await mkdir(join(root, 'objects'), { recursive: true, mode: 0o700 })
  const schema = (await db.prepare('SELECT current_schema() AS schema').get<{ schema: string }>())!.schema
  const dump = join(root, 'database.dump')
  await pgTool('pg_dump', connectionString, root, ['--format=custom', '--no-owner', '--no-acl', `--schema=${schema}`, '--file=/archive/database.dump'])
  await chmod(dump, 0o600)
  const catalog = await db.prepare("SELECT object_key, content_hash AS sha256, size_bytes, content_type, state FROM stored_objects WHERE NOT blocked AND state IN ('ready','staging') ORDER BY object_key").all<{ object_key: string; sha256: string; size_bytes: number; content_type: string; state: string }>()
  const archived: ArchivedObject[] = []
  const ledger = new ErasureLedger(objects)
  for (const item of catalog) {
    if (await ledger.isHashRemoved(item.sha256)) continue
    const object = await objects.get(item.object_key)
    if (!object && item.state === 'staging') continue
    if (!object) throw new Error(`Backup object is missing: ${item.object_key}`)
    if (objectHash(object.body) !== item.sha256 || object.body.length !== item.size_bytes) throw new Error(`Backup object integrity failure: ${item.object_key}`)
    await writeFile(join(root, 'objects', item.sha256), object.body, { mode: 0o600 })
    archived.push({ key: item.object_key, sha256: item.sha256, size: item.size_bytes, contentType: item.content_type })
  }
  const manifest: StorageArchive = { version: 1, sourceBuildId, createdAt: new Date().toISOString(), schema, database: await digest(dump), objects: archived }
  await writeFile(join(root, 'archive.json'), JSON.stringify(manifest, null, 2) + '\n', { mode: 0o600 })
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

/** Restore into an EMPTY database. Caller supplies current, independent erasure facts. */
export async function restoreStorageArchive(connectionString: string, db: PostgresDatabase, objects: S3ObjectStore, root: string, currentErasureFacts: ErasureBatch[]) {
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
    const listing = await pgTool('pg_restore', connectionString, root, ['--list', '/archive/database.dump'])
    // public already exists and owns citext in a fresh target database. Omit
    // only its schema-creation entry, keeping every application object.
    await writeFile(join(root, restoreList), listing.split('\n').filter(line => !/^\d+; \d+ \d+ SCHEMA - public /.test(line)).join('\n'), { mode: 0o600 })
    await pgTool('pg_restore', connectionString, root, [`--use-list=/archive/${restoreList}`, '--exit-on-error', '--single-transaction', '--no-owner', '--no-acl', '/archive/database.dump'])
    await migratePostgres(db)
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
