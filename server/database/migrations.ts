import { readFileSync } from 'node:fs'
import type { PostgresDatabase } from './postgres'

/** Serialize schema changes before any application instance starts accepting requests. */
export async function migratePostgres(db: PostgresDatabase): Promise<void> {
  await db.transaction(async () => {
    await db.query('SELECT pg_advisory_xact_lock(962)')
    await db.exec('CREATE TABLE IF NOT EXISTS postgres_schema_migrations (version integer PRIMARY KEY)')
    const current = await db.prepare('SELECT version FROM postgres_schema_migrations WHERE version = 1').get()
    if (current) return
    await db.exec(readFileSync(new URL('./schema.sql', import.meta.url), 'utf8'))
    await db.prepare('INSERT INTO postgres_schema_migrations (version) VALUES (1)').run()
  })()
}
