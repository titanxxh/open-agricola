import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { createTestDatabase } from './_helpers/postgres'
import { testStorageEnvironment } from './_helpers/objects'
import { S3ObjectStore } from '../storage/s3-store'
import { ResourceStore } from '../storage/resource-store'

let resources: ResourceStore
let peer: ResourceStore
let now = Date.now()
beforeAll(async () => {
  const objects = S3ObjectStore.fromEnv(testStorageEnvironment(), `test/${randomUUID()}/`)
  resources = new ResourceStore(await createTestDatabase(), objects, () => now)
  peer = new ResourceStore(resources.db, objects, () => now)
})
afterAll(async () => { await resources.objects.clearPrefix(); resources.objects.close(); await resources.db.close() })

it('protects durable preparations and published references across collectors', async () => {
  await resources.stage('replay-assets/retained', Buffer.from('same'), 'image/png')
  await resources.stage('card-art/abandoned.png', Buffer.from('other'), 'image/png')
  await resources.reference('room-preparation', 'room-a', ['replay-assets/retained'])
  now += 2 * 24 * 60 * 60 * 1000
  expect((await Promise.all([resources.collect(), peer.collect()])).reduce((a, b) => a + b)).toBe(1)
  expect((await peer.read('replay-assets/retained'))?.body.toString()).toBe('same')
  expect(await peer.read('card-art/abandoned.png')).toBeNull()
  await resources.db.transaction(async () => {
    await peer.reference('replay', 'room-a', ['replay-assets/retained'])
    await peer.release('room-preparation', 'room-a')
  })()
  expect(await resources.collect()).toBe(0)
  await peer.release('replay', 'room-a')
  expect(await resources.collect()).toBe(1)
  await expect(resources.reference('replay', 'too-late', ['replay-assets/retained'])).rejects.toThrow('not ready')
})

it('keeps the erasure barrier independent of a restored database and merges concurrent ledger writes', async () => {
  const body = Buffer.from('removed art')
  const hash = await resources.stage('card-art/removed.png', body, 'image/png')
  await Promise.all(Array.from({ length: 6 }, (_, i) => peer.ledger.append({ version: 1, entries: [], assetTakedowns: [{ hash: i ? i.toString().repeat(64) : hash, reason: 'moderation', removedAt: now }] })))
  expect(await resources.ledger.read()).toHaveLength(6)
  // No DB barrier yet, as with an older DB backup. Public access still closes.
  expect(await peer.read('card-art/removed.png')).toBeNull()
  await expect(peer.stage('card-art/resurrect.png', body, 'image/png')).rejects.toThrow('removed')
  await resources.blockHash(hash)
  expect(await resources.collect()).toBe(1)
  expect(await resources.objects.get('card-art/removed.png')).toBeNull()
})

it('retains saved nested Workshop candidates until the draft releases them', async () => {
  await resources.stage('card-art/candidate.png', Buffer.from('candidate'), 'image/png')
  await resources.db.prepare("INSERT INTO users(id, username, display_name, password_hash, created_at) VALUES ('author', 'author', 'Author', 'hash', 1)").run()
  await resources.db.prepare(`INSERT INTO workshop_cards(id, author_id, card_id, card_type, name, card_json, draft_generation_json, created_at, updated_at)
    VALUES ('card', 'author', 'CUSTOM_candidate', 'minor', 'Candidate', '{}', ?, 1, 1)`).run(JSON.stringify({ art: { history: [{ resultUrl: '/card-art/candidate.png', referenceImages: ['/card-art/candidate.png'] }] } }))
  now += 2 * 24 * 60 * 60 * 1000
  expect(await peer.collect()).toBe(0)
  expect(await peer.read('card-art/candidate.png')).not.toBeNull()
  await resources.db.prepare("UPDATE workshop_cards SET draft_generation_json = '{}' WHERE id = 'card'").run()
  expect(await peer.collect()).toBe(1)
  expect(await peer.read('card-art/candidate.png')).toBeNull()
})
