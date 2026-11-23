// Restore and target-build validation decode every Replay Step with the rule
// engine. The archive CLI loads this module only for `validate`, `restore` and
// `check-live`, so export, ledger and scratch commands stay engine-free (#2024).
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { PostgresDatabase } from '../server/database/postgres'
import { ResourceStore } from '../server/storage/resource-store'
import { ErasureLedger, type ErasureBatch } from '../server/storage/erasure-ledger'
import { objectHash, S3ObjectStore } from '../server/storage/s3-store'
import { applyReplayRemovalLedger } from '../server/game/replay-removal'
import { migratePostgres } from '../server/database/migrations'
import { validateStorage, type StorageValidationOptions } from './storage-validation'
import { storageValidationConcurrency } from './storage-validation-concurrency'
import { mergeLedger, pgTool, verifiedDump, type StorageArchive } from './storage-archive'
import { withBackupScratch } from './backup-scratch'

/** Restore into an EMPTY database. Caller supplies current, independent erasure facts. */
export async function restoreStorageArchive(connectionString: string, db: PostgresDatabase, objects: S3ObjectStore, root: string, currentErasureFacts: ErasureBatch[], signal?: AbortSignal, validation: StorageValidationOptions = {}) {
  signal?.throwIfAborted()
  const manifest = JSON.parse(await readFile(join(root, 'archive.json'), 'utf8')) as StorageArchive
  if (![1, 2].includes(manifest.version) || !/^[a-z_][a-z0-9_]*$/.test(manifest.schema) || !Array.isArray(manifest.objects)) throw new Error('Invalid storage archive manifest')
  if (await db.prepare("SELECT 1 FROM information_schema.tables WHERE table_schema NOT IN ('pg_catalog','information_schema') LIMIT 1").get()) throw new Error('Restore requires an empty target database')
  const dumpPath = await verifiedDump(root, manifest)
  const barrier = `restore:${manifest.database.sha256}`
  // The target stays detached from ingress until validation succeeds. The
  // durable barrier also prevents accidental startup after a failed restore.
  const record = async (status: 'importing' | 'validated' | 'failed', report: unknown = null) => {
    await db.prepare(`INSERT INTO data_imports(source_hash,status,report_json,updated_at) VALUES (?,?,?,?)
      ON CONFLICT(source_hash) DO UPDATE SET status=excluded.status,report_json=excluded.report_json,updated_at=excluded.updated_at`)
      .run(barrier, status, report === null ? null : JSON.stringify(report), Date.now())
  }
  const restoreDirectory = await mkdtemp(join(tmpdir(), 'agricola-restore-'))
  const restoreList = join(restoreDirectory, 'restore.list')
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
    const listing = await pgTool('pg_restore', connectionString, root, ['--list', dumpPath], signal)
    // public already exists and owns citext in a fresh target database. Omit
    // only its schema-creation entry, keeping every application object.
    await writeFile(restoreList, listing.split('\n').filter(line => !/^\d+; \d+ \d+ SCHEMA - public /.test(line)).join('\n'), { mode: 0o600 })
    await pgTool('pg_restore', connectionString, root, ['--use-list=/archive-restore.list', '--exit-on-error', '--single-transaction', '--no-owner', '--no-acl', dumpPath], signal, undefined, restoreList)
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
    const report = await validateStorage(db, resources, validation)
    await record('validated', report)
    return { manifest, validation: report }
  } catch (error) {
    // Native restore is transactional. If it failed before schema creation,
    // initialize the empty target only to leave a permanent startup barrier.
    await migratePostgres(db)
    await record('failed', { error: error instanceof Error ? error.message : 'Restore validation failed' })
    throw error
  } finally { await rm(restoreDirectory, { recursive: true, force: true }) }
}

/** Target-build validation never connects an application to historical data. */
export async function validateArchiveInIsolation(root: string, env: NodeJS.ProcessEnv = process.env, signal?: AbortSignal) {
  if (!env.DATABASE_URL) throw new Error('DATABASE_URL is required')
  const concurrency = storageValidationConcurrency(env.STORAGE_VALIDATION_CONCURRENCY)
  const manifest = JSON.parse(await readFile(join(root, 'archive.json'), 'utf8')) as StorageArchive
  const sourceObjects = S3ObjectStore.fromEnv(env, env.S3_PREFIX ?? '', signal)
  try {
    return await withBackupScratch({ directory: env.BACKUP_SCRATCH_DIRECTORY || dirname(resolve(root)), env,
      schema: manifest.schema, deadlineEpochMs: Number(env.BACKUP_DEADLINE_EPOCH_MS || Date.now() + 30 * 60 * 1000),
      signal: signal ?? new AbortController().signal }, async target => {
      const ledger = await new ErasureLedger(sourceObjects).read()
      const { validation } = await restoreStorageArchive(target.connectionString, target.db, target.objects, root, ledger, target.signal, { concurrency })
      return { formatVersion: 2, sourceBuildId: manifest.sourceBuildId, targetBuildId: env.GAME_BUILD_ID ?? 'development',
        createdAt: manifest.createdAt, validatedAt: new Date().toISOString(),
        database: { sha256: manifest.database.sha256, size: manifest.database.size, ...(manifest.database.format ? { format: manifest.database.format } : {}) }, ...validation }
    })
  } finally { sourceObjects.close() }
}

/** `check-live`: migrate and validate stopped live storage in place behind a durable target-build barrier. */
export async function validateLiveStorage(db: PostgresDatabase, objects: S3ObjectStore, buildId: string, validation: StorageValidationOptions) {
  const existing = await db.prepare("SELECT to_regclass('app_instances') AS instances").get<{ instances: string | null }>()
  if (existing?.instances && await db.prepare("SELECT 1 FROM app_instances WHERE status!='stopped' AND lease_until>(extract(epoch FROM clock_timestamp())*1000)::bigint LIMIT 1").get()) throw new Error('Stop all applications before validating the target build')
  await migratePostgres(db)
  const barrier = `target-build:${buildId}`
  await db.prepare(`INSERT INTO data_imports(source_hash,status,updated_at) VALUES (?,'importing',?)
    ON CONFLICT(source_hash) DO UPDATE SET status='importing',updated_at=excluded.updated_at`).run(barrier, Date.now())
  try {
    const resources = new ResourceStore(db, objects)
    await applyReplayRemovalLedger(db, { resources })
    const report = await validateStorage(db, resources, validation)
    await db.prepare("UPDATE data_imports SET status='validated',report_json=?,updated_at=? WHERE source_hash=?").run(JSON.stringify(report), Date.now(), barrier)
    return report
  } catch (error) {
    await db.prepare("UPDATE data_imports SET status='failed',updated_at=? WHERE source_hash=?").run(Date.now(), barrier)
    throw error
  }
}
