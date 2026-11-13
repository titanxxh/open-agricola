import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { PostgresDatabase } from './postgres'

/** Serialize schema changes before any application instance starts accepting requests. */
export async function migratePostgres(db: PostgresDatabase): Promise<void> {
  await db.transaction(async () => {
    await db.query('SELECT pg_advisory_xact_lock(962)')
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
    migrations.push('047-prerelease-sessions.sql')
    for (const [index, filename] of migrations.entries()) {
      const version = index + 1
      if (await db.prepare('SELECT version FROM postgres_schema_migrations WHERE version = ?').get(version)) continue
      await db.exec(readFileSync(join(import.meta.dirname, filename), 'utf8'))
      await db.prepare('INSERT INTO postgres_schema_migrations (version) VALUES (?)').run(version)
    }
  })()
}
