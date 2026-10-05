import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { PostgresDatabase } from '../server/database/postgres'
import type { ResourceStore } from '../server/storage/resource-store'
import { getDb } from '../server/db'
import { migratePostgres } from '../server/database/migrations'
import { getResources, closeResources } from '../server/storage/runtime'
import { applyReplayRemovalLedger } from '../server/game/replay-removal'
import { validateStorage } from './storage-validation'

export type BackupMetadata = {
  backupStem: string; createdAt: string; sourceBuildId: string; targetBuildId: string
  targetRef: string; archiveSha256: string; archiveSizeBytes: number
}
/** Run against a stopped, isolated PostgreSQL restore and its configured S3 namespace. */
export async function validateBackupDatabase(db: PostgresDatabase, metadata: BackupMetadata, resources: ResourceStore) {
  await migratePostgres(db)
  const removal = await applyReplayRemovalLedger(db, { resources })
  const validation = await validateStorage(db, resources)
  const version = await db.prepare('SELECT MAX(version) AS version FROM postgres_schema_migrations').get<{ version: number }>()
  return { formatVersion: 2, ...metadata, postgresSchemaVersion: version!.version, ...validation,
    replayRemovalLedgerEntryCount: removal.entries, replayRemovalRoomCount: new Set(removal.removedRoomIds).size, replayRemovalAssetCount: removal.deletedAssetHashes.length }
}
export type BackupValidationReport = Awaited<ReturnType<typeof validateBackupDatabase>>

export function backupMetadata(env: NodeJS.ProcessEnv): BackupMetadata {
  const required = (name: string) => { const value = env[name]?.trim(); if (!value) throw new Error(`${name} is required`); return value }
  const archiveSha256 = required('BACKUP_SHA256')
  if (!/^[a-f0-9]{64}$/.test(archiveSha256)) throw new Error('BACKUP_SHA256 is invalid')
  const archiveSizeBytes = Number(required('BACKUP_SIZE_BYTES'))
  if (!Number.isSafeInteger(archiveSizeBytes) || archiveSizeBytes <= 0) throw new Error('BACKUP_SIZE_BYTES is invalid')
  return { backupStem: required('BACKUP_STEM'), createdAt: required('BACKUP_CREATED_AT'), sourceBuildId: required('SOURCE_BUILD_ID'), targetBuildId: required('TARGET_BUILD_ID'), targetRef: required('TARGET_REF'), archiveSha256, archiveSizeBytes }
}

export async function runBackupValidation(env: NodeJS.ProcessEnv = process.env): Promise<BackupValidationReport> {
  if (env.APPLICATIONS_STOPPED !== '1') throw new Error('APPLICATIONS_STOPPED=1 is required for controlled restore validation')
  const metadata = backupMetadata(env)
  const db = getDb()
  try { return await validateBackupDatabase(db, metadata, getResources()) }
  finally { closeResources(); await db.close() }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { console.log(JSON.stringify(await runBackupValidation(), null, 2)) }
  catch (error) { console.error(error instanceof Error ? error.message : 'backup validation failed'); process.exitCode = 1 }
}
