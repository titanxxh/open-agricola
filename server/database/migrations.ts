import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { PostgresDatabase } from './postgres'

/** Extensions belong to the database, not to a schema; `schema.sql` installs them for whichever schema migrates first. */
export const DATABASE_EXTENSIONS = ['citext']
/**
 * One migration transaction holds about 1,200 lock-table entries, and PostgreSQL's default table
 * (`max_locks_per_transaction` 64) fits about five of them. `docker-compose.local.yml` sets this size so that
 * test and E2E schemas can migrate at the same time; a smaller table keeps every migration serialized.
 */
export const CONCURRENT_MIGRATION_LOCKS = 1024

export type MigrationLockInput = { schema: string | null; maxLocksPerTransaction: number; installedExtensions: number }

/**
 * `database` is the lock every deployment has always taken. `schema` lets migrations of different non-default
 * schemas run concurrently, and applies only where that is safe: the lock table is large enough and the
 * database-wide extensions already exist. The default schema of the formal and prerelease applications is never scoped.
 */
export function migrationLockScope({ schema, maxLocksPerTransaction, installedExtensions }: MigrationLockInput): 'database' | 'schema' {
  return schema !== null && schema !== 'public' && maxLocksPerTransaction >= CONCURRENT_MIGRATION_LOCKS
    && installedExtensions === DATABASE_EXTENSIONS.length ? 'schema' : 'database'
}

async function lockMigration(db: PostgresDatabase): Promise<void> {
  const row = await db.prepare(`
    SELECT current_schema() AS schema, current_setting('max_locks_per_transaction')::integer AS locks,
      (SELECT count(*)::integer FROM pg_extension WHERE extname = ANY(?::text[])) AS extensions
  `).get<{ schema: string | null; locks: number; extensions: number }>(DATABASE_EXTENSIONS)
  if (!row || migrationLockScope({ schema: row.schema, maxLocksPerTransaction: row.locks, installedExtensions: row.extensions }) === 'database') {
    await db.query('SELECT pg_advisory_xact_lock(962)')
    return
  }
  // The shared database-wide lock still excludes a default-schema migration and any instance from before
  // schema scoping, which take it exclusively; the two-key lock serializes this schema alone.
  await db.query('SELECT pg_advisory_xact_lock_shared(962)')
  await db.prepare('SELECT pg_advisory_xact_lock(962, hashtext(?))').get(row.schema)
}

/**
 * Prerelease databases created before 2026-11-20 recorded their own migrations as versions 47, 48 and 50, which
 * main later assigned to Web Push and Classic Card Edition. Such a database has the prerelease identity table
 * but neither main migration; its versions move to 9047, 9048 and 9050 so the main migrations still run.
 */
async function movePrereleaseMigrationVersions(db: PostgresDatabase): Promise<void> {
  const row = await db.prepare(`
    SELECT to_regclass('prerelease_external_identities') IS NOT NULL AS prerelease,
      to_regclass('web_push_bindings') IS NOT NULL AS web_push,
      EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'rooms' AND column_name = 'card_edition') AS card_edition,
      EXISTS (SELECT 1 FROM postgres_schema_migrations WHERE version = 9047) AS moved,
      EXISTS (SELECT 1 FROM postgres_schema_migrations WHERE version = 47) AS legacy
  `).get<{ prerelease: boolean; web_push: boolean; card_edition: boolean; moved: boolean; legacy: boolean }>()
  if (!row?.prerelease || row.moved || !row.legacy) return
  if (row.web_push || row.card_edition) throw new Error('Prerelease migration versions 47-50 are ambiguous; restore the database from its backup')
  await db.exec('UPDATE postgres_schema_migrations SET version = version + 9000 WHERE version IN (47, 48, 50)')
}

/** Serialize schema changes before any application instance starts accepting requests. */
export async function migratePostgres(db: PostgresDatabase): Promise<void> {
  await db.transaction(async () => {
    await lockMigration(db)
    await db.exec('CREATE TABLE IF NOT EXISTS postgres_schema_migrations (version integer PRIMARY KEY)')
    const migrations = ['schema.sql', '002-platform-concurrency.sql', '003-report-claims.sql', '004-shared-objects.sql', '005-resource-reference-validation.sql', '006-command-receipts.sql', '007-command-input-windows.sql', '008-data-imports.sql', '009-room-ownership.sql', '010-room-presence.sql', '011-shared-invalidation.sql', '012-development-room-slots.sql', '013-observability.sql', '014-room-seat-owners.sql', '015-workshop-submissions.sql', '016-retire-workshop-oauth.sql', '017-retire-workshop-owner-approval.sql', '018-workshop-submission-deletion.sql', '019-workshop-art-urls.sql', '020-workshop-references.sql', '021-account-link-pkce.sql', '022-fractional-result-scores.sql', '023-online-room-admission.sql', '024-onboarding-browser-binding.sql', '025-room-invitations.sql', '026-room-color-confirmation.sql']
    migrations.push('027-game-creation-configuration.sql')
    migrations.push('028-moor-balance-rules.sql')
    migrations.push('029-game-termination.sql')
    migrations.push('030-bug-report-client-diagnostics.sql')
    migrations.push('031-game-opening-facts.sql')
    migrations.push('032-room-retention-policy.sql')
    migrations.push('033-password-reset.sql')
    migrations.push('034-team-result-archive.sql')
    migrations.push('035-team-room-members.sql')
    migrations.push('036-beta-access.sql')
    migrations.push('037-prerelease-authority.sql')
    migrations.push('038-workshop-public-versions.sql')
    migrations.push('039-prerelease-identity-generations.sql')
    migrations.push('040-bug-report-feedback.sql')
    migrations.push('041-bug-report-triage.sql')
    migrations.push('042-bug-report-fix-links.sql')
    migrations.push('043-bug-report-release-feedback.sql')
    migrations.push('044-historical-feedback-subjects.sql')
    migrations.push('045-feedback-summary-and-deletion.sql')
    migrations.push('046-browser-auth-policy.sql')
    migrations.push('047-web-push.sql')
    migrations.push('048-classic-card-edition.sql')
    // Prerelease-only migrations use 9000 + their original number so main can keep numbering 047 onward.
    await movePrereleaseMigrationVersions(db)
    migrations.push('9047-prerelease-sessions.sql')
    migrations.push('9050-prerelease-handoff-receipts.sql')
    for (const filename of migrations) {
      const version = filename === 'schema.sql' ? 1 : Number.parseInt(filename.slice(0, filename.indexOf('-')), 10)
      if (await db.prepare('SELECT version FROM postgres_schema_migrations WHERE version = ?').get(version)) continue
      await db.exec(readFileSync(join(import.meta.dirname, filename), 'utf8'))
      await db.prepare('INSERT INTO postgres_schema_migrations (version) VALUES (?)').run(version)
    }
  })()
}
