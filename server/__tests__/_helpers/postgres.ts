import { randomUUID } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { parseEnv } from 'node:util'
import { PostgresDatabase } from '../../database/postgres'
import { migratePostgres } from '../../database/migrations'
import { releaseAll } from './release-all'

/** A private schema in an explicitly separate test database, never DATABASE_URL. */
export function getTestDatabaseUrl(): string {
  const root = dirname(execFileSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], { encoding: 'utf8' }).trim())
  const connectionString = process.env.TEST_DATABASE_URL
    ?? parseEnv(readFileSync(join(root, 'data/dependencies.local'), 'utf8')).TEST_DATABASE_URL
  if (!connectionString) throw new Error('Start test dependencies with node scripts/local-services.mjs --test')
  return connectionString
}

/**
 * A maintenance connection for CREATE / DROP DATABASE. Both can wait for a cluster
 * checkpoint, and a cancelled DROP leaves an invalid database (cleared by
 * scripts/invalid-databases.mjs), so the connection disables statement timeouts,
 * including role and database defaults.
 */
export function databaseMaintenance(connectionString = getTestDatabaseUrl()): PostgresDatabase {
  return new PostgresDatabase({ connectionString, max: 1, statement_timeout: 0 })
}

export async function createTestDatabase(): Promise<PostgresDatabase> {
  const connectionString = getTestDatabaseUrl()
  const schema = `test_${randomUUID().replaceAll('-', '')}`
  const admin = new PostgresDatabase({ connectionString, max: 1 })
  const db = new PostgresDatabase({ connectionString, schema, max: 4 })
  const closeDb = db.close.bind(db)
  let closing: Promise<void> | undefined
  const release = () => closing ??= releaseAll([
    closeDb,
    () => admin.exec(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`),
    () => admin.close(),
  ])
  try {
    await admin.exec(`CREATE SCHEMA "${schema}"`)
    await migratePostgres(db)
  } catch (error) {
    await release().catch((cleanupError: unknown) => {
      throw new AggregateError([error, cleanupError], 'Test database setup and cleanup both failed')
    })
    throw error
  }
  db.close = release
  return db
}
