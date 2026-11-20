import { afterEach, beforeEach, expect, it } from 'vitest'
import type { PostgresDatabase } from '../database/postgres'
import { migratePostgres } from '../database/migrations'
import { convertLegacyDraftSource } from '../database/050-native-workshop-drafts'
import { admitNativeCardSource, isNativeCardSource } from '../../shared/custom-code/card-source-admission'
import { loadWorkspace } from '../workshop-drafts'
import { WOODPILE_SOURCE } from '../../shared/custom-code/__tests__/native-card-fixture'
import { createTestDatabase } from './_helpers/postgres'

const LEGACY_SOURCE = `const CARD_ID = 'CUSTOM_LegacyHarvester'
const CARD_DEF = MinorImprovement({ id: CARD_ID, name: 'Legacy Harvester', deck: 'CUSTOM', number: 0, desc: ['Each harvest, gain 1 <FOOD>.'], cost: { wood: 1 }, prerequisite: { occupation: 1 } })
const bonus = (player) => player.resources.food > 3 ? 2 : 1
const unused = () => 'pruned'
const CARD_IMPL = {
  effect: { id: CARD_ID, onHarvest: (_state, player) => gainLeaf(CARD_ID, { food: bonus(player) }) },
  listeners: [{ cardIds: [CARD_ID], actions: ['fishing'], phases: ['after'], handler: () => ({ flow: gainLeaf(CARD_ID, { wood: 1 }) }) }],
}`
// No CARD_DEF: the old normalization cannot recover the card's metadata.
const UNCONVERTIBLE_SOURCE = `const CARD_ID = 'CUSTOM_LegacyBroken'
const CARD_IMPL = { effect: { id: CARD_ID } }`

let db: PostgresDatabase
beforeEach(async () => {
  db = await createTestDatabase()
  await db.exec("INSERT INTO users(id,username,display_name,password_hash,created_at) VALUES ('author','author','Author','hash',1)")
})
afterEach(async () => { await db.close() })

const insertDraft = async (id: string, cardId: string, cardJson: Record<string, unknown>, manifest: Record<string, unknown> | null) => {
  await db.prepare(`INSERT INTO workshop_cards(id,author_id,card_id,card_type,name,card_json,code_manifest,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,1,1)`).run(id, 'author', cardId, 'minor', String(cardJson.name), JSON.stringify(cardJson), manifest ? JSON.stringify(manifest) : null)
}
const row = (id: string) => db.prepare('SELECT card_json, code_manifest, draft_revision FROM workshop_cards WHERE id=?')
  .get<{ card_json: string; code_manifest: string | null; draft_revision: number }>(id)

it('converts the old normalization output into an admitted Card Source module', () => {
  const converted = convertLegacyDraftSource(LEGACY_SOURCE, 'CUSTOM_LegacyHarvester', 'minor')
  expect(converted).not.toBeNull()
  expect(isNativeCardSource(converted!)).toBe(true)
  expect(admitNativeCardSource(converted!, 'CUSTOM_LegacyHarvester')).toMatchObject({
    valid: true, cardType: 'minor',
    meta: { id: 'CUSTOM_LegacyHarvester', deck: 'community', prerequisite: '1 Occupations', occupationPrerequisites: { min: 1 } },
  })
  // The injected helper becomes an import; unreachable sandbox helpers are pruned.
  expect(converted).toContain("import { gainLeaf } from '../helpers/pay-gain-node'")
  expect(converted).toContain('CUSTOM_LegacyHarvester-listener-1')
  expect(converted).not.toContain('pruned')
  expect(converted).not.toContain('_impl')
  expect(convertLegacyDraftSource(UNCONVERTIBLE_SOURCE, 'CUSTOM_LegacyBroken', 'minor')).toBeNull()
})

it('runs once at startup: converts legacy drafts, flags the rest and leaves native drafts alone', async () => {
  const legacyJson = { id: 'CUSTOM_LegacyHarvester', name: 'Legacy Harvester', card_type: 'minor', deck: 'CUSTOM', number: 0, desc: ['Each harvest, gain 1 <FOOD>.'],
    _code: LEGACY_SOURCE, _compiled: 'legacy compiled' }
  await insertDraft('legacy', 'CUSTOM_LegacyHarvester', legacyJson, { effectHooks: ['onHarvest'], listeners: [] })
  await insertDraft('broken', 'CUSTOM_LegacyBroken', { id: 'CUSTOM_LegacyBroken', name: 'Legacy Broken', _code: UNCONVERTIBLE_SOURCE, _compiled: 'legacy compiled' },
    { effectHooks: [], listeners: [] })
  await insertDraft('native', 'CUSTOM_WoodpileHook', { id: 'CUSTOM_WoodpileHook', name: 'Woodpile Hook', _code: WOODPILE_SOURCE, _compiled: 'native compiled' },
    { format: 'native-card-source' })
  await insertDraft('empty', 'CUSTOM_NoAbility', { id: 'CUSTOM_NoAbility', name: 'No Ability' }, null)
  const before = { native: await row('native'), empty: await row('empty') }

  await db.prepare("DELETE FROM postgres_schema_migrations WHERE version=(SELECT MAX(version) FROM postgres_schema_migrations)").run()
  await migratePostgres(db)

  const legacy = (await row('legacy'))!
  const legacyCard = JSON.parse(legacy.card_json) as Record<string, unknown>
  expect(isNativeCardSource(legacyCard._code as string)).toBe(true)
  expect(legacyCard._compiled).toContain('exports.CUSTOM_LegacyHarvester')
  expect(legacyCard.desc).toEqual(legacyJson.desc)
  expect(JSON.parse(legacy.code_manifest!)).toMatchObject({ format: 'native-card-source', cardDefinition: { cardType: 'minor', meta: { id: 'CUSTOM_LegacyHarvester' } } })
  expect(legacy.draft_revision).toBe(2)

  // A failed conversion keeps the authored text and loses its validation evidence.
  const broken = (await row('broken'))!
  expect(JSON.parse(broken.card_json)).toEqual({ id: 'CUSTOM_LegacyBroken', name: 'Legacy Broken', _code: UNCONVERTIBLE_SOURCE })
  expect(broken.code_manifest).toBeNull()
  const workspace = await loadWorkspace(db, 'broken', 'author')
  expect(workspace.draft).toMatchObject({ effectCode: UNCONVERTIBLE_SOURCE, compiledCode: null, codeManifest: null })

  expect(await row('native')).toEqual(before.native)
  expect(await row('empty')).toEqual(before.empty)

  // Recorded once: a later startup does not touch the drafts again.
  await db.prepare("UPDATE workshop_cards SET card_json=? WHERE id='broken'").run(JSON.stringify({ id: 'CUSTOM_LegacyBroken', name: 'Legacy Broken', _code: LEGACY_SOURCE }))
  await migratePostgres(db)
  expect(JSON.parse((await row('broken'))!.card_json)._code).toBe(LEGACY_SOURCE)
})

it('drops the retired public card registry', async () => {
  expect(await db.prepare("SELECT to_regclass('workshop_public_versions') AS name").get()).toEqual({ name: null })
  expect(await db.prepare("SELECT count(*)::integer AS count FROM pg_proc WHERE pronamespace = current_schema()::regnamespace AND proname IN ('record_workshop_public_version','record_inserted_workshop_public_version')").get())
    .toEqual({ count: 0 })
})
