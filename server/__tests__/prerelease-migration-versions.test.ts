import { afterEach, describe, expect, it } from 'vitest'
import { migratePostgres } from '../database/migrations'
import type { PostgresDatabase } from '../database/postgres'
import { createTestDatabase } from './_helpers/postgres'

let db: PostgresDatabase | undefined
afterEach(async () => { await db?.close(); db = undefined })

const versions = async (target: PostgresDatabase) =>
  (await target.prepare('SELECT version FROM postgres_schema_migrations WHERE version >= 46 ORDER BY version').all<{ version: number }>())
    .map(row => row.version)

const mainSchema = async (target: PostgresDatabase) => target.prepare(`
  SELECT to_regclass('web_push_bindings') IS NOT NULL AS web_push,
    EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema()
      AND table_name = 'rooms' AND column_name = 'card_edition') AS card_edition
`).get<{ web_push: boolean; card_edition: boolean }>()

/** The prerelease database as it was before main numbered Web Push 047 and Classic Card Edition 048. */
async function recreateLegacyPrereleaseDatabase(target: PostgresDatabase) {
  await target.exec(`
    DROP TABLE web_push_deliveries, web_push_events, web_push_retired_devices, web_push_device_reservations, web_push_bindings;
    ALTER TABLE rooms DROP COLUMN classic_deck_ids, DROP COLUMN card_edition;
    ALTER TABLE game_results DROP COLUMN classic_deck_ids, DROP COLUMN card_edition;
    ALTER TABLE game_opening_facts DROP COLUMN classic_deck_ids, DROP COLUMN classic_edition;
    ALTER TABLE sandbox_settings DROP COLUMN classic_deck_ids_json, DROP COLUMN card_edition;
    DELETE FROM postgres_schema_migrations WHERE version IN (47, 48);
    UPDATE postgres_schema_migrations SET version = version - 9000 WHERE version IN (9047, 9048, 9050);
  `)
}

describe('prerelease migration versions', () => {
  it('numbers prerelease-only migrations after main on a new database', async () => {
    db = await createTestDatabase()
    expect(await versions(db)).toEqual([46, 47, 48, 9047, 9048, 9050])
    expect(await mainSchema(db)).toEqual({ web_push: true, card_edition: true })
  })

  it('moves the legacy prerelease versions so the main 047 and 048 migrations run once', async () => {
    db = await createTestDatabase()
    await recreateLegacyPrereleaseDatabase(db)
    expect(await versions(db)).toEqual([46, 47, 48, 50])
    expect(await mainSchema(db)).toEqual({ web_push: false, card_edition: false })

    await migratePostgres(db)
    expect(await versions(db)).toEqual([46, 47, 48, 9047, 9048, 9050])
    expect(await mainSchema(db)).toEqual({ web_push: true, card_edition: true })
    expect(await db.prepare("SELECT to_regclass('prerelease_external_identities') IS NOT NULL AS present").get<{ present: boolean }>())
      .toEqual({ present: true })

    await migratePostgres(db)
    expect(await versions(db)).toEqual([46, 47, 48, 9047, 9048, 9050])
  })

  it('refuses a prerelease database whose versions 47 and 48 cannot be told apart', async () => {
    db = await createTestDatabase()
    await db.exec('DELETE FROM postgres_schema_migrations WHERE version IN (9047, 9048, 9050)')
    await expect(migratePostgres(db)).rejects.toThrow('Prerelease migration versions 47-50 are ambiguous')
    expect(await versions(db)).toEqual([46, 47, 48])
  })
})
