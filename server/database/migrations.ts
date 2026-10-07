import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { PostgresDatabase } from './postgres'

/** Serialize schema changes before any application instance starts accepting requests. */
export async function migratePostgres(db: PostgresDatabase): Promise<void> {
  await db.transaction(async () => {
    await db.query('SELECT pg_advisory_xact_lock(962)')
    await db.exec('CREATE TABLE IF NOT EXISTS postgres_schema_migrations (version integer PRIMARY KEY)')
    const migrations = ['schema.sql', '002-platform-concurrency.sql', '003-report-claims.sql', '004-shared-objects.sql', '005-resource-reference-validation.sql', '006-command-receipts.sql', '007-command-input-windows.sql', '008-data-imports.sql', '009-room-ownership.sql', '010-room-presence.sql', '011-shared-invalidation.sql', '012-development-room-slots.sql', '013-observability.sql', '014-room-seat-owners.sql', '015-workshop-submissions.sql', '016-retire-workshop-oauth.sql', '017-retire-workshop-owner-approval.sql', '018-workshop-submission-deletion.sql']
    for (const [index, filename] of migrations.entries()) {
      const version = index + 1
      if (await db.prepare('SELECT version FROM postgres_schema_migrations WHERE version = ?').get(version)) continue
      await db.exec(readFileSync(join(import.meta.dirname, filename), 'utf8'))
      await db.prepare('INSERT INTO postgres_schema_migrations (version) VALUES (?)').run(version)
    }
  })()
}
