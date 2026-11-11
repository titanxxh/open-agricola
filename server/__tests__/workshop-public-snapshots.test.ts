import { randomUUID } from 'node:crypto'
import { createServer } from 'node:http'
import { afterAll, beforeAll, expect, it, vi } from 'vitest'
import { createTestDatabase } from './_helpers/postgres'
import { testStorageEnvironment } from './_helpers/objects'
import { S3ObjectStore } from '../storage/s3-store'
import { ResourceStore } from '../storage/resource-store'
import { approveCurrentDraft, createCard, enterReview, publish, type WorkshopDraft } from '../workshop-drafts'

const db = await createTestDatabase()
const objects = S3ObjectStore.fromEnv(testStorageEnvironment(), `test/${randomUUID()}/`)
const resources = new ResourceStore(db, objects)
vi.mock('../db.ts', () => ({ getDb: () => db }))
vi.mock('../storage/runtime.ts', () => ({ getResources: () => resources }))

const server = createServer()
let origin: string
beforeAll(async () => {
  await db.prepare("INSERT INTO users(id,username,display_name,password_hash,created_at) VALUES ('author','author','Author','hash',1)").run()
  const { handleWorkshopRoute } = await import('../workshop')
  server.on('request', (req, res) => {
    void handleWorkshopRoute(req, res).then(handled => {
      if (!handled) { res.writeHead(404); res.end() }
    }).catch(() => { res.writeHead(500); res.end() })
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Missing HTTP address')
  origin = `http://127.0.0.1:${address.port}`
})
afterAll(async () => {
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
  await objects.clearPrefix(); objects.close(); await db.close()
})

let reviewNumber = 1000
async function publicCard(name: string, overrides: Partial<WorkshopDraft> = {}) {
  const artUrl = `/card-art/${name}.png`
  await resources.stage(`card-art/${name}.png`, Buffer.from('public image bytes'), 'image/png')
  const draft: WorkshopDraft = {
    cardId: `CUSTOM_${name}`, cardType: 'minor', name, description: 'Approved public text',
    cardJson: { id: `CUSTOM_${name}`, name, card_type: 'minor', deck: 'CUSTOM', number: 0, desc: ['Approved public text'] },
    effectCode: null, compiledCode: null, codeManifest: null, artUrl,
    generation: { privateDraftNote: 'private generation must not leave main' },
    ...overrides,
  }
  const card = await createCard(db, { authorId: 'author', draft })
  await enterReview(db, { cardId: card.id, authorId: 'author', expectedRevision: card.revision, prUrl: `https://github.com/titanxxh/open-agricola/pull/${++reviewNumber}`, commitSha: 'approved-head' })
  await approveCurrentDraft(db, { cardId: card.id, authorId: 'author', commitSha: 'approved-head', reviewId: 'review' })
  const published = await publish(db, { cardId: card.id, authorId: 'author', baseRevision: card.revision })
  return { card, draft, versionId: published.versionId }
}

it('exports only a live approved version and verifies the actual image bytes in a fixed public input', async () => {
  const { card, versionId } = await publicCard('PublicSnapshot')
  const response = await fetch(`${origin}/api/workshop/public-cards/v1/cards/${card.id}`)
  expect(response.status).toBe(200)
  expect(response.headers.get('cache-control')).toBe('no-store')
  const body = await response.json()
  expect(body.snapshot.input.source).toEqual({ kind: 'workshop-public', authority: 'titanxxh/open-agricola', workshopCardId: card.id, versionId })
  expect(body.snapshot.input.cardJson).toEqual({ id: 'CUSTOM_PublicSnapshot', name: 'PublicSnapshot', card_type: 'minor', deck: 'CUSTOM', number: 0, desc: ['Approved public text'] })
  expect(body.snapshot.input.effectCode).toBeNull()
  expect(body.snapshot.input.art).toEqual({ sha256: 'a5bffcec89fd9b44e469064aebe5e87341902f84bcbefc884fe59ea2a88c7597', contentType: 'image/png', sizeBytes: 18, base64: 'cHVibGljIGltYWdlIGJ5dGVz' })
  expect(body.snapshot.sha256).toMatch(/^[a-f0-9]{64}$/)
  expect(JSON.stringify(body)).not.toContain('compiled')
  expect(JSON.stringify(body)).not.toContain('private generation')
})

it('keeps an existing public input after author unpublish while refusing new creation and private versions', async () => {
  const { card, draft, versionId } = await publicCard('OfflineSnapshot')
  const initial = await fetch(`${origin}/api/workshop/public-cards/v1/cards/${card.id}`).then(response => response.json())
  const { unpublish, checkpointDraft, pinCurrentDraftVersion } = await import('../workshop-drafts')
  await unpublish(db, { cardId: card.id, authorId: 'author', baseRevision: card.revision })
  const changed = await checkpointDraft(db, { cardId: card.id, authorId: 'author', baseRevision: card.revision, draft: { ...draft, description: 'PRIVATE draft', cardJson: { ...draft.cardJson, desc: ['PRIVATE draft'] } } })
  const privateVersion = await pinCurrentDraftVersion(db, { cardId: card.id, authorId: 'author', baseRevision: changed.revision })
  const now = Date.now()
  const clock = vi.spyOn(Date, 'now').mockReturnValue(now)
  try {
    const status = await fetch(`${origin}/api/workshop/public-cards/v1/cards/${card.id}/versions/${versionId}/status?sha256=${initial.snapshot.sha256}`)
    expect(status.status).toBe(200)
    expect(await status.json()).toEqual({ ok: true, protocolVersion: 1, sha256: initial.snapshot.sha256, checkedAt: now, validUntil: now + 30000, access: { kind: 'offline', allowNew: false, allowExisting: true } })
    expect((await fetch(`${origin}/api/workshop/public-cards/v1/cards/${card.id}`)).status).toBe(404)
    const privateStatus = await fetch(`${origin}/api/workshop/public-cards/v1/cards/${card.id}/versions/${privateVersion.versionId}/status?sha256=${initial.snapshot.sha256}`, { headers: { authorization: 'Bearer author-token' } })
    expect(await privateStatus.json()).toMatchObject({ access: { kind: 'not_public', allowNew: false, allowExisting: false } })
  } finally { clock.mockRestore() }
})

it('denies a public input after administrator disable, including an old version after new publication', async () => {
  const { card, draft, versionId } = await publicCard('DisabledSnapshot')
  const initial = await fetch(`${origin}/api/workshop/public-cards/v1/cards/${card.id}`).then(response => response.json())
  const { unpublish, checkpointDraft, adminTakedownCard } = await import('../workshop-drafts')
  await unpublish(db, { cardId: card.id, authorId: 'author', baseRevision: card.revision })
  const changed = await checkpointDraft(db, { cardId: card.id, authorId: 'author', baseRevision: card.revision, draft: { ...draft, description: 'New public version', cardJson: { ...draft.cardJson, desc: ['New public version'] } } })
  await enterReview(db, { cardId: card.id, authorId: 'author', expectedRevision: changed.revision, prUrl: 'https://github.com/titanxxh/open-agricola/pull/999999', commitSha: 'new-head' })
  await approveCurrentDraft(db, { cardId: card.id, authorId: 'author', commitSha: 'new-head', reviewId: 'new-review' })
  await publish(db, { cardId: card.id, authorId: 'author', baseRevision: changed.revision })
  const statusUrl = `${origin}/api/workshop/public-cards/v1/cards/${card.id}/versions/${versionId}/status?sha256=${initial.snapshot.sha256}`
  expect(await fetch(statusUrl).then(response => response.json())).toMatchObject({ access: { kind: 'superseded', allowNew: false, allowExisting: true } })
  const current = await fetch(`${origin}/api/workshop/public-cards/v1/cards/${card.id}`).then(response => response.json())
  expect(current.snapshot.sha256).not.toBe(initial.snapshot.sha256)
  expect(initial.snapshot.input.cardJson.desc).toEqual(['Approved public text'])
  await adminTakedownCard(db, card.id)
  expect(await fetch(statusUrl).then(response => response.json())).toMatchObject({ access: { kind: 'disabled', allowNew: false, allowExisting: false } })
  expect((await fetch(`${origin}/api/workshop/public-cards/v1/cards/${card.id}`)).status).toBe(404)
})

it('rejects missing or changed image bytes without issuing fresh status, then recovers the same fixed input', async () => {
  const { card, versionId } = await publicCard('MissingImage')
  const initial = await fetch(`${origin}/api/workshop/public-cards/v1/cards/${card.id}`).then(response => response.json())
  const statusUrl = `${origin}/api/workshop/public-cards/v1/cards/${card.id}/versions/${versionId}/status?sha256=${initial.snapshot.sha256}`
  await objects.delete('card-art/MissingImage.png')
  const missing = await fetch(statusUrl)
  expect(missing.status).toBe(503)
  expect(await missing.json()).toEqual({ ok: false, code: 'public_card_source_unavailable' })
  await objects.putImmutable('card-art/MissingImage.png', Buffer.from('changed bytes'), 'image/png')
  expect((await fetch(statusUrl)).status).toBe(503)
  await objects.delete('card-art/MissingImage.png')
  await objects.putImmutable('card-art/MissingImage.png', Buffer.from('public image bytes'), 'image/png')
  expect(await fetch(statusUrl).then(response => response.json())).toMatchObject({ sha256: initial.snapshot.sha256, access: { kind: 'current', allowNew: true, allowExisting: true } })
  expect(await fetch(statusUrl.replace(initial.snapshot.sha256, '0'.repeat(64))).then(response => response.json())).toMatchObject({ access: { kind: 'content_mismatch', allowNew: false, allowExisting: false } })
})

it('serves the same public source to its author and guests without exposing compiler artifacts or drafts', async () => {
  const meta = { id: 'CUSTOM_PublicSource', name: 'PublicSource', deck: 'CUSTOM', number: 0, desc: ['Approved public text'] }
  const { card } = await publicCard('PublicSource', {
    effectCode: 'const CARD_DEF = {}; const CARD_IMPL = {}', compiledCode: 'MAIN compiler output',
    cardJson: { ...meta, card_type: 'minor', implemented: true, _draft: { note: 'PRIVATE' } },
    codeManifest: { effectHooks: [], listeners: [], cardDefinition: { cardType: 'minor', meta } },
  })
  await db.prepare('INSERT INTO sessions(token,user_id,expires_at,created_at) VALUES (?,?,?,?)').run('author-token', 'author', Date.now() + 86400000, Date.now())
  const guest = await fetch(`${origin}/api/workshop/public-cards/v1/cards/${card.id}`).then(response => response.json())
  const author = await fetch(`${origin}/api/workshop/public-cards/v1/cards/${card.id}`, { headers: { authorization: 'Bearer author-token' } }).then(response => response.json())
  expect(author.snapshot).toEqual(guest.snapshot)
  expect(author.snapshot.input).toMatchObject({ effectCode: 'const CARD_DEF = {}; const CARD_IMPL = {}', cardJson: { id: 'CUSTOM_PublicSource', name: 'PublicSource' } })
  expect(JSON.stringify(author)).not.toContain('MAIN compiler output')
  expect(JSON.stringify(author)).not.toContain('PRIVATE')
  const { unpublish } = await import('../workshop-drafts')
  await unpublish(db, { cardId: card.id, authorId: 'author', baseRevision: card.revision })
  expect((await fetch(`${origin}/api/workshop/public-cards/v1/cards/${card.id}`, { headers: { authorization: 'Bearer author-token' } })).status).toBe(404)
})

it('does not refresh status after an expired read and keeps the API read-only', async () => {
  const { card, versionId } = await publicCard('SlowSource')
  const initial = await fetch(`${origin}/api/workshop/public-cards/v1/cards/${card.id}`).then(response => response.json())
  const read = resources.read.bind(resources)
  const start = Date.now()
  const clock = vi.spyOn(Date, 'now').mockReturnValue(start)
  const delayedRead = vi.spyOn(resources, 'read').mockImplementationOnce(async key => {
    const image = await read(key)
    clock.mockReturnValue(start + 30000)
    return image
  })
  try {
    const response = await fetch(`${origin}/api/workshop/public-cards/v1/cards/${card.id}/versions/${versionId}/status?sha256=${initial.snapshot.sha256}`)
    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({ ok: false, code: 'public_card_source_unavailable' })
  } finally { delayedRead.mockRestore(); clock.mockRestore() }
  const methods = ['POST', 'PUT', 'DELETE']
  for (const method of methods) {
    const response = await fetch(`${origin}/api/workshop/public-cards/v1/cards/${card.id}`, { method })
    expect(response.status).toBe(405)
    expect(await response.json()).toEqual({ ok: false, code: 'read_only' })
  }
  expect((await fetch(`${origin}/api/workshop/public-cards/v2/cards/${card.id}`)).status).toBe(400)
  expect((await fetch(`${origin}/api/workshop/public-cards/v1/cards/${card.id}?version=private`)).status).toBe(400)
  expect(await db.prepare('SELECT * FROM sandbox_settings').all()).toEqual([])
  expect(await db.prepare('SELECT * FROM sandbox_cards').all()).toEqual([])
})

it('observes an administrator disable committed while image verification is in flight', async () => {
  const { card, versionId } = await publicCard('ConcurrentDisable')
  const initial = await fetch(`${origin}/api/workshop/public-cards/v1/cards/${card.id}`).then(response => response.json())
  const { adminTakedownCard } = await import('../workshop-drafts')
  const read = resources.read.bind(resources)
  const duringRead = vi.spyOn(resources, 'read').mockImplementationOnce(async key => {
    const image = await read(key)
    await adminTakedownCard(db, card.id)
    return image
  })
  try {
    const response = await fetch(`${origin}/api/workshop/public-cards/v1/cards/${card.id}/versions/${versionId}/status?sha256=${initial.snapshot.sha256}`)
    expect(await response.json()).toMatchObject({ access: { kind: 'disabled', allowNew: false, allowExisting: false } })
  } finally { duringRead.mockRestore() }
})


it('does not authorize new creation when a retained publication has lost its approved-version binding', async () => {
  const { card, versionId } = await publicCard('LostBinding')
  const initial = await fetch(`${origin}/api/workshop/public-cards/v1/cards/${card.id}`).then(response => response.json())
  await db.prepare('UPDATE workshop_cards SET approved_version_id=NULL WHERE id=?').run(card.id)
  expect((await fetch(`${origin}/api/workshop/public-cards/v1/cards/${card.id}`)).status).toBe(404)
  const status = await fetch(`${origin}/api/workshop/public-cards/v1/cards/${card.id}/versions/${versionId}/status?sha256=${initial.snapshot.sha256}`).then(response => response.json())
  expect(status.access).toEqual({ kind: 'offline', allowNew: false, allowExisting: true })
})

it('waits for an actual same-card version during card-first import and never admits another card version', async () => {
  const cardJson = { id: 'CUSTOM_LateVersion', name: 'Late version', card_type: 'minor', deck: 'CUSTOM', number: 0, desc: ['Public source'] }
  await db.prepare(`INSERT INTO workshop_cards(id,author_id,card_id,card_type,name,card_json,created_at,updated_at,review_status,live,approved_version_id)
    VALUES ('late-version-card','author',?,'minor',?,?,1,1,'approved',1,'late-public-v1')`)
    .run(cardJson.id, cardJson.name, JSON.stringify(cardJson))
  expect((await fetch(`${origin}/api/workshop/public-cards/v1/cards/late-version-card`)).status).toBe(404)
  await db.prepare(`INSERT INTO workshop_card_versions(id,card_id,card_json,version_number,created_by,created_at)
    VALUES ('late-public-v1','late-version-card',?,1,'author',1)`).run(JSON.stringify(cardJson))
  const response = await fetch(`${origin}/api/workshop/public-cards/v1/cards/late-version-card`)
  expect(response.status).toBe(200)
  expect((await response.json()).snapshot.input.source).toEqual({ kind: 'workshop-public', authority: 'titanxxh/open-agricola', workshopCardId: 'late-version-card', versionId: 'late-public-v1' })
  await db.prepare(`INSERT INTO workshop_cards(id,author_id,card_id,card_type,name,card_json,created_at,updated_at,review_status,live,approved_version_id)
    VALUES ('wrong-card','author','CUSTOM_WrongCard','minor','Wrong','{}',1,1,'approved',1,'late-public-v1')`).run()
  expect((await fetch(`${origin}/api/workshop/public-cards/v1/cards/wrong-card`)).status).toBe(404)
  const status = await fetch(`${origin}/api/workshop/public-cards/v1/cards/wrong-card/versions/late-public-v1/status?sha256=${'0'.repeat(64)}`).then(result => result.json())
  expect(status.access).toEqual({ kind: 'not_public', allowNew: false, allowExisting: false })
})
