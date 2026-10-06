import { randomUUID } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PostgresDatabase } from '../server/database/postgres'
import { S3ObjectStore } from '../server/storage/s3-store'
import { ErasureLedger } from '../server/storage/erasure-ledger'
import { ResourceStore } from '../server/storage/resource-store'
import { migratePostgres } from '../server/database/migrations'
import { applyReplayRemovalLedger } from '../server/game/replay-removal'
import { validateStorage } from './storage-validation'
import { decodeLedger, exportStorageArchive, mergeLedger, restoreStorageArchive, type StorageArchive } from './storage-archive'

/** Target-build validation never connects an application to historical data. */
export async function validateArchiveInIsolation(root: string, env: NodeJS.ProcessEnv = process.env) {
  if (!env.DATABASE_URL) throw new Error('DATABASE_URL is required')
  const manifest = JSON.parse(await readFile(join(root, 'archive.json'), 'utf8')) as StorageArchive
  const sourceObjects = S3ObjectStore.fromEnv(env)
  const targetObjects = S3ObjectStore.fromEnv(env, `test/backup-${randomUUID()}/`)
  // CREATE/DROP DATABASE can wait for a cluster checkpoint under normal load.
  // Keep the longer bound on this maintenance connection, not runtime queries.
  const admin = new PostgresDatabase({ connectionString: env.DATABASE_URL, max: 1, statement_timeout: 120_000 })
  const name = `backup_${randomUUID().replaceAll('-', '')}`
  const url = new URL(env.VALIDATION_DATABASE_URL || env.DATABASE_URL)
  if (!env.VALIDATION_DATABASE_URL) url.pathname = `/${name}`
  if (url.toString() === new URL(env.DATABASE_URL).toString()) throw new Error('Validation must use a separate empty database')
  const target = new PostgresDatabase({ connectionString: url.toString(), schema: manifest.schema })
  let created = false
  try {
    // On managed PostgreSQL a separately provisioned empty validation database
    // can be supplied instead of granting CREATEDB to the runtime account.
    if (!env.VALIDATION_DATABASE_URL) { await admin.exec(`CREATE DATABASE "${name}"`); created = true }
    const ledger = await new ErasureLedger(sourceObjects).read()
    const { validation } = await restoreStorageArchive(url.toString(), target, targetObjects, root, ledger)
    return { formatVersion: 2, sourceBuildId: manifest.sourceBuildId, targetBuildId: env.GAME_BUILD_ID ?? 'development',
      createdAt: manifest.createdAt, validatedAt: new Date().toISOString(), database: manifest.database, ...validation }
  } finally {
    await target.close()
    try { if (created) await admin.exec(`DROP DATABASE "${name}"`) }
    finally {
      await admin.close(); sourceObjects.close()
      try { await targetObjects.clearPrefix() } finally { targetObjects.close() }
    }
  }
}

export async function archiveCommand(args: string[], env: NodeJS.ProcessEnv = process.env): Promise<void> {
  const [command, path, flag] = args
  if (!path || !['export', 'validate', 'restore', 'check-live', 'ledger-export', 'ledger-merge'].includes(command)) {
    throw new Error('Usage: storage-archive-cli.ts export|validate|restore <directory> [--applications-stopped] | check-live <build-id> --applications-stopped | ledger-export|ledger-merge <ledger.json>')
  }
  if (command === 'validate') {
    console.log(JSON.stringify(await validateArchiveInIsolation(resolve(path), env), null, 2)); return
  }
  const objects = S3ObjectStore.fromEnv(env)
  let db: PostgresDatabase | undefined
  try {
    if (command === 'ledger-merge') { await mergeLedger(objects, decodeLedger(await readFile(path, 'utf8'))); return }
    if (command === 'ledger-export') {
      // Union the existing independent copy before refreshing it. A restored
      // or stale source can never replace newer deletion facts on disk.
      try { await mergeLedger(objects, decodeLedger(await readFile(path, 'utf8'))) }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
      const batches = await new ErasureLedger(objects).read()
      await writeFile(path, JSON.stringify({ version: 1, batches }) + '\n', { mode: 0o600 }); return
    }
    if (flag !== '--applications-stopped') throw new Error('Stop all applications and pass --applications-stopped')
    if (!env.DATABASE_URL) throw new Error('DATABASE_URL is required')
    db = new PostgresDatabase({ connectionString: env.DATABASE_URL, schema: env.DATABASE_SCHEMA })
    if (command === 'check-live') {
      const existing = await db.prepare("SELECT to_regclass('app_instances') AS instances").get<{ instances: string | null }>()
      if (existing?.instances && await db.prepare("SELECT 1 FROM app_instances WHERE status!='stopped' AND lease_until>(extract(epoch FROM clock_timestamp())*1000)::bigint LIMIT 1").get()) throw new Error('Stop all applications before validating the target build')
      await migratePostgres(db)
      const barrier = `target-build:${path}`
      await db.prepare(`INSERT INTO data_imports(source_hash,status,updated_at) VALUES (?,'importing',?)
        ON CONFLICT(source_hash) DO UPDATE SET status='importing',updated_at=excluded.updated_at`).run(barrier, Date.now())
      try {
        const resources = new ResourceStore(db, objects)
        await applyReplayRemovalLedger(db, { resources })
        const validation = await validateStorage(db, resources)
        await db.prepare("UPDATE data_imports SET status='validated',report_json=?,updated_at=? WHERE source_hash=?").run(JSON.stringify(validation), Date.now(), barrier)
        console.log(JSON.stringify(validation, null, 2)); return
      } catch (error) {
        await db.prepare("UPDATE data_imports SET status='failed',updated_at=? WHERE source_hash=?").run(Date.now(), barrier)
        throw error
      }
    }
    if (command === 'export') {
      await exportStorageArchive(env.DATABASE_URL, db, objects, resolve(path), env.GAME_BUILD_ID ?? '')
    } else {
      // An authoritative, separately retained ledger is mandatory even when it
      // is empty. Ordinary archives intentionally cannot supply this input.
      if (!env.CURRENT_ERASURE_LEDGER) throw new Error('CURRENT_ERASURE_LEDGER must point to the latest independent ledger copy')
      const ledger = decodeLedger(await readFile(env.CURRENT_ERASURE_LEDGER, 'utf8'))
      console.log(JSON.stringify(await restoreStorageArchive(env.DATABASE_URL, db, objects, resolve(path), ledger), null, 2))
    }
  } finally { objects.close(); await db?.close() }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { await archiveCommand(process.argv.slice(2)) }
  catch (error) { console.error(error instanceof Error ? error.message : 'Storage operation failed'); process.exitCode = 1 }
}
