import { createHash, randomUUID } from 'node:crypto'
import type { Dirent } from 'node:fs'
import { mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises'
import { join, resolve, sep } from 'node:path'
import { Client } from 'pg'
import { PostgresDatabase } from '../server/database/postgres'
import { S3ObjectStore } from '../server/storage/s3-store'

type ScratchRecord = {
  version: 1
  token: string
  jobId: string
  deadlineEpochMs: number
  environment: string
  schema: string
  target: { kind: 'created' } | { kind: 'provided'; schemaExisted: boolean }
}

type Scratch = {
  connectionString: string
  db: PostgresDatabase
  objects: S3ObjectStore
  signal: AbortSignal
}

const recordName = (token: string) => `.backup-scratch-${token}.json`
const databaseName = (token: string) => `backup_${token}`
const guardName = (token: string) => `backup_guard_${token}`
const objectPrefix = (token: string) => `test/backup-${token}/`
const guardComment = (record: ScratchRecord) => `open-agricola:backup-scratch:${record.token}:${record.schema}`
const validationLock = "hashtextextended('open-agricola:backup-validation', 0)"

function sourceUrl(env: NodeJS.ProcessEnv): URL {
  if (!env.DATABASE_URL) throw new Error('DATABASE_URL is required for backup scratch')
  const url = new URL(env.DATABASE_URL)
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) throw new Error('Invalid backup database configuration')
  return url
}

function identity(url: URL): string[] {
  return [url.searchParams.get('host') || url.hostname, url.searchParams.get('port') || url.port || '5432', decodeURIComponent(url.pathname.slice(1)),
    url.searchParams.get('hostaddr') ?? '']
}

function targetUrl(record: ScratchRecord, env: NodeJS.ProcessEnv): URL {
  const source = sourceUrl(env)
  const target = new URL(record.target.kind === 'provided' ? env.VALIDATION_DATABASE_URL || '' : source.toString())
  if (record.target.kind === 'created') target.pathname = `/${databaseName(record.token)}`
  if (!['postgres:', 'postgresql:'].includes(target.protocol)) throw new Error('Invalid backup validation database configuration')
  // Distinct names also reject aliases of the source host without trusting DNS spelling.
  if (identity(source)[2] === identity(target)[2]) throw new Error('Backup scratch must never use the source database')
  return target
}

function environmentIdentity(env: NodeJS.ProcessEnv): string {
  const source = sourceUrl(env)
  const provided = env.VALIDATION_DATABASE_URL ? new URL(env.VALIDATION_DATABASE_URL) : undefined
  if (!env.S3_ENDPOINT || !env.S3_BUCKET) throw new Error('Object storage configuration is required for backup scratch')
  const endpoint = new URL(env.S3_ENDPOINT)
  return createHash('sha256').update(JSON.stringify({ source: identity(source),
    provided: provided ? identity(provided) : null, sourceSchema: env.DATABASE_SCHEMA ?? 'public',
    objects: [endpoint.origin, endpoint.pathname, env.S3_BUCKET, env.S3_REGION ?? '', env.S3_PREFIX ?? ''] })).digest('hex')
}

function decodeRecord(value: unknown, filename: string): ScratchRecord {
  if (!value || typeof value !== 'object' || !('version' in value) || value.version !== 1
    || !('token' in value) || typeof value.token !== 'string' || !/^[a-f0-9]{32}$/.test(value.token)
    || filename !== recordName(value.token)
    || !('jobId' in value) || typeof value.jobId !== 'string' || !/^[A-Za-z0-9-]{1,128}$/.test(value.jobId)
    || !('deadlineEpochMs' in value) || typeof value.deadlineEpochMs !== 'number' || !Number.isSafeInteger(value.deadlineEpochMs)
    || !('environment' in value) || typeof value.environment !== 'string' || !/^[a-f0-9]{64}$/.test(value.environment)
    || !('schema' in value) || typeof value.schema !== 'string' || !/^[a-z_][a-z0-9_]{0,62}$/.test(value.schema)
    || !('target' in value) || !value.target || typeof value.target !== 'object' || !('kind' in value.target)) {
    throw new Error('Invalid backup scratch ownership record')
  }
  let target: ScratchRecord['target']
  if (value.target.kind === 'created') target = { kind: 'created' }
  else if (value.target.kind === 'provided' && 'schemaExisted' in value.target && typeof value.target.schemaExisted === 'boolean') {
    target = { kind: 'provided', schemaExisted: value.target.schemaExisted }
  } else throw new Error('Invalid backup scratch target')
  if (value.schema.startsWith('backup_guard_')) throw new Error('Invalid backup scratch schema')
  return { version: 1, token: value.token, jobId: value.jobId, deadlineEpochMs: value.deadlineEpochMs,
    environment: value.environment, schema: value.schema, target }
}

async function connect(connectionString: string, statementTimeout = 10_000): Promise<Client> {
  const client = new Client({ connectionString, connectionTimeoutMillis: 10_000, statement_timeout: statementTimeout,
    options: statementTimeout === 0 ? '-c statement_timeout=0' : undefined,
    application_name: 'agricola-backup-scratch' })
  client.on('error', () => {})
  try { await client.connect(); return client } catch (error) { await client.end().catch(() => {}); throw error }
}

async function lockProvided(client: Client): Promise<void> {
  const result = await client.query<{ acquired: boolean }>(`SELECT pg_try_advisory_lock(${validationLock}) AS acquired`)
  if (!result.rows[0]?.acquired) throw new Error('Validation database is already in use')
}

async function writeRecord(directory: string, record: ScratchRecord, first = false): Promise<void> {
  const path = join(directory, recordName(record.token))
  const bytes = JSON.stringify(record) + '\n'
  if (first) await writeFile(path, bytes, { flag: 'wx', mode: 0o600, flush: true })
  else {
    const temporary = `${path}.tmp`
    await writeFile(temporary, bytes, { flag: 'wx', mode: 0o600, flush: true })
    await rename(temporary, path)
  }
}

async function claimProvided(client: Client, directory: string, record: ScratchRecord): Promise<void> {
  if (record.target.kind !== 'provided') throw new Error('Provided scratch target required')
  await lockProvided(client)
  await client.query('BEGIN')
  try {
    const tables = await client.query("SELECT 1 FROM information_schema.tables WHERE table_schema NOT IN ('pg_catalog','information_schema') LIMIT 1")
    const previous = await client.query("SELECT 1 FROM pg_namespace WHERE nspname ~ '^backup_guard_[a-f0-9]{32}$' LIMIT 1")
    const existing = await client.query<{ exists: boolean }>('SELECT EXISTS(SELECT 1 FROM pg_namespace WHERE nspname=$1) AS exists', [record.schema])
    const contents = await client.query(`SELECT 1 FROM pg_namespace n WHERE n.nspname=$1 AND (
      EXISTS(SELECT 1 FROM pg_class c WHERE c.relnamespace=n.oid)
      OR EXISTS(SELECT 1 FROM pg_proc p WHERE p.pronamespace=n.oid)
      OR EXISTS(SELECT 1 FROM pg_type t WHERE t.typnamespace=n.oid))`, [record.schema])
    if (tables.rowCount || contents.rowCount) throw new Error('Validation must use a separate empty database and empty schema')
    if (previous.rowCount) throw new Error('Validation database has unreclaimed backup scratch')
    record.target.schemaExisted = existing.rows[0]?.exists === true
    await writeRecord(directory, record)
    await client.query(`CREATE SCHEMA "${guardName(record.token)}"`)
    await client.query(`COMMENT ON SCHEMA "${guardName(record.token)}" IS '${guardComment(record)}'`)
    await client.query('COMMIT')
  } catch (error) { await client.query('ROLLBACK'); throw error }
}

async function cleanOwned(record: ScratchRecord, env: NodeJS.ProcessEnv, mode: 'finished' | 'expired', signal?: AbortSignal): Promise<void> {
  if (record.environment !== environmentIdentity(env)) throw new Error('Backup scratch belongs to a different environment')
  if ((record.target.kind === 'provided') !== Boolean(env.VALIDATION_DATABASE_URL)) throw new Error('Backup scratch target configuration changed')
  const url = targetUrl(record, env)
  signal?.throwIfAborted()
  if (record.target.kind === 'created') {
    const admin = await connect(sourceUrl(env).toString(), 0)
    // A pool can resolve end() before its sockets finish closing. Normal cleanup
    // lets PostgreSQL drain them; only expired, abandoned workers require FORCE.
    try { await admin.query(`DROP DATABASE IF EXISTS "${databaseName(record.token)}"${mode === 'expired' ? ' WITH (FORCE)' : ''}`) }
    finally { await admin.end() }
  } else {
    const client = await connect(url.toString())
    try {
      await lockProvided(client)
      const guard = await client.query<{ description: string | null }>("SELECT obj_description(oid,'pg_namespace') AS description FROM pg_namespace WHERE nspname=$1", [guardName(record.token)])
      if (guard.rows.length) {
        if (guard.rows[0]?.description !== guardComment(record)) throw new Error('Backup scratch ownership marker does not match')
        await client.query('BEGIN')
        try {
          await client.query(`DROP SCHEMA IF EXISTS "${record.schema}" CASCADE`)
          if (record.target.schemaExisted) await client.query(`CREATE SCHEMA "${record.schema}"`)
          await client.query(`DROP SCHEMA "${guardName(record.token)}"`)
          await client.query('COMMIT')
        } catch (error) { await client.query('ROLLBACK'); throw error }
      }
    } finally { await client.end() }
  }
  signal?.throwIfAborted()
  const objects = S3ObjectStore.fromEnv(env, objectPrefix(record.token), signal)
  try { await objects.clearPrefix() } finally { objects.close() }
}

/** Records live beside archives, never inside the disposable capture directory. */
export async function withBackupScratch<T>(request: {
  directory: string; env: NodeJS.ProcessEnv; schema: string; deadlineEpochMs: number; signal: AbortSignal
}, work: (scratch: Scratch) => Promise<T>): Promise<T> {
  const { directory, env, signal } = request
  if (resolve(directory).split(sep).some(part => part === '.pending' || part.startsWith('.pending-'))) {
    throw new Error('Backup scratch records must outlive the pending capture directory')
  }
  if (!/^[a-z_][a-z0-9_]{0,62}$/.test(request.schema) || request.schema.startsWith('backup_guard_')) throw new Error('Invalid backup scratch schema')
  const remaining = request.deadlineEpochMs - Date.now()
  if (!Number.isSafeInteger(request.deadlineEpochMs) || remaining <= 0 || remaining > 30 * 60 * 1000) throw new Error('Invalid backup scratch deadline')
  const token = randomUUID().replaceAll('-', '')
  const jobId = env.BACKUP_JOB_ID || `manual-${token}`
  if (!/^[A-Za-z0-9-]{1,128}$/.test(jobId)) throw new Error('Invalid backup scratch job identity')
  const record: ScratchRecord = { version: 1, token, jobId, deadlineEpochMs: request.deadlineEpochMs,
    environment: environmentIdentity(env), schema: request.schema,
    target: env.VALIDATION_DATABASE_URL ? { kind: 'provided', schemaExisted: false } : { kind: 'created' } }
  const url = targetUrl(record, env)
  const objects = S3ObjectStore.fromEnv(env, objectPrefix(token), signal)
  const db = new PostgresDatabase({ connectionString: url.toString(), schema: record.schema })
  let keeper: Client | undefined
  let recorded = false
  try {
    signal.throwIfAborted()
    await mkdir(directory, { recursive: true, mode: 0o700 })
    await writeRecord(directory, record, true)
    recorded = true
    if (record.target.kind === 'created') {
      const admin = await connect(sourceUrl(env).toString(), 0)
      try { await admin.query(`CREATE DATABASE "${databaseName(token)}"`) }
      catch (error) {
        if (error instanceof Error && 'code' in error && error.code === '42P04') {
          // A known creation collision is not ownership of that database.
          await rm(join(directory, recordName(token)))
          recorded = false
        }
        throw error
      } finally { await admin.end() }
    } else {
      keeper = await connect(url.toString())
      await claimProvided(keeper, directory, record)
    }
    signal.throwIfAborted()
    return await work({ connectionString: url.toString(), db, objects, signal })
  } finally {
    await db.close()
    objects.close()
    await keeper?.end()
    if (recorded) {
      await cleanOwned(record, env, 'finished')
      await rm(join(directory, recordName(token)))
    }
  }
}

async function cleanupScratchRecords(directory: string, env: NodeJS.ProcessEnv,
  now: number, signal?: AbortSignal): Promise<number> {
  let files: string[]
  try { files = await readdir(directory) } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return 0
    throw error
  }
  let cleaned = 0
  for (const filename of files.filter(name => /^\.backup-scratch-[a-f0-9]{32}\.json$/.test(name)).sort()) {
    signal?.throwIfAborted()
    const record = decodeRecord(JSON.parse(await readFile(join(directory, filename), 'utf8')), filename)
    if (record.deadlineEpochMs > now) continue
    await cleanOwned(record, env, 'expired', signal)
    await rm(join(directory, filename))
    cleaned++
  }
  return cleaned
}

/** Expired records remain available after every failed cleanup for the next job. */
export async function cleanupBackupScratch(directory: string, env: NodeJS.ProcessEnv = process.env,
  now = Date.now(), signal?: AbortSignal): Promise<number> {
  let entries: Dirent[]
  try { entries = await readdir(directory, { withFileTypes: true }) } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return 0
    throw error
  }
  let cleaned = await cleanupScratchRecords(directory, env, now, signal)
  for (const entry of entries) {
    if (!entry.isDirectory() || !/^\.backup-scratch-runs-[a-zA-Z0-9-]+$/.test(entry.name)) continue
    const child = join(directory, entry.name)
    cleaned += await cleanupScratchRecords(child, env, now, signal)
    if ((await readdir(child)).length === 0) await rm(child, { recursive: true })
  }
  return cleaned
}
