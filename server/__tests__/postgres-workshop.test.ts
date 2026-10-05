import { getTestDatabaseUrl } from './_helpers/postgres'
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { PostgresDatabase } from '../database/postgres'
import { migratePostgres } from '../database/migrations'
import { checkpointDraft, createCard, pinCurrentDraftVersion, type WorkshopDraft } from '../workshop-drafts'

const connectionString = getTestDatabaseUrl()
const schema = `test_${randomUUID().replaceAll('-', '')}`
const admin = new PostgresDatabase({ connectionString })
const db = new PostgresDatabase({ connectionString, schema })
beforeAll(async () => {
  await admin.exec(`CREATE SCHEMA "${schema}"`)
  await migratePostgres(db)
  await db.prepare('INSERT INTO users (id, username, display_name, password_hash, created_at) VALUES (?, ?, ?, ?, ?)').run('author', 'author', 'Author', 'test-hash', 1)
})
afterAll(async () => {
  await db.close()
  await admin.exec(`DROP SCHEMA "${schema}" CASCADE`)
  await admin.close()
})
const draft: WorkshopDraft = {
  cardId: 'CUSTOM_SharedDraft', cardType: 'occupation', name: 'Shared Draft', description: 'Test',
  cardJson: { id: 'CUSTOM_SharedDraft', name: 'Shared Draft', card_type: 'occupation', desc: ['Test'], deck: 'CUSTOM', number: 0 },
  effectCode: null, compiledCode: null, codeManifest: null, artUrl: null, generation: {},
}

it('accepts one concurrent checkpoint per revision and pins one immutable version per content', async () => {
  const created = await createCard(db, { authorId: 'author', draft })
  const results = await Promise.allSettled(['first', 'second'].map(description => checkpointDraft(db, {
    cardId: created.id, authorId: 'author', baseRevision: created.revision, draft: { ...draft, description },
  })))
  const winner = results.find(result => result.status === 'fulfilled')
  expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1)
  expect(results.find(result => result.status === 'rejected')).toMatchObject({ reason: { code: 'conflict', message: 'Draft revision conflict' } })
  if (winner?.status !== 'fulfilled') throw new Error('No checkpoint accepted')
  const pins = await Promise.all(Array.from({ length: 3 }, () => pinCurrentDraftVersion(db, {
    cardId: created.id, authorId: 'author', baseRevision: winner.value.revision,
  })))
  expect(new Set(pins.map(pin => pin.versionId)).size).toBe(1)
})
