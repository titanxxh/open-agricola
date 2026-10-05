import { randomUUID } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { parseEnv } from 'node:util'
import { PostgresDatabase } from '../../database/postgres'
import { migratePostgres } from '../../database/migrations'

/** A private schema in an explicitly separate test database, never DATABASE_URL. */
export function getTestDatabaseUrl(): string {
  const root = dirname(execFileSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], { encoding: 'utf8' }).trim())
  const connectionString = process.env.TEST_DATABASE_URL
    ?? parseEnv(readFileSync(join(root, 'data/dependencies.local'), 'utf8')).TEST_DATABASE_URL
  if (!connectionString) throw new Error('Start test dependencies with node scripts/local-services.mjs --test')
  return connectionString
}

export async function createTestDatabase(): Promise<PostgresDatabase> {
  const connectionString = getTestDatabaseUrl()
  const schema = `test_${randomUUID().replaceAll('-', '')}`
  const admin = new PostgresDatabase({ connectionString, max: 1 })
  const db = new PostgresDatabase({ connectionString, schema, max: 4 })
  await admin.exec(`CREATE SCHEMA "${schema}"`)
  try {
    await migratePostgres(db)
  } catch (error) {
    await db.close()
    await admin.exec(`DROP SCHEMA "${schema}" CASCADE`)
    await admin.close()
    throw error
  }
  const close = db.close.bind(db)
  db.close = async () => {
    await close()
    await admin.exec(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`)
    await admin.close()
  }
  return db
}
