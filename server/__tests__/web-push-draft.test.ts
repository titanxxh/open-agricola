import { randomUUID } from 'node:crypto'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { BROWSER_AUTH_VERSION } from '../../shared/contract/browser-auth'
import { firstDraftPick } from '../../shared/draft/__tests__/draft-fixtures'
import { draftSeatProgress } from '../../shared/projections/draft-progress'
import { createTestDatabase } from './_helpers/postgres'
import type { PostgresDatabase } from '../database/postgres'
import { GameSession } from '../game/authoritative-session'
import { PostgresRoomPersistence } from '../game/persistence/postgres-adapter'
import { RoomCommitter, replayIntentFromCommand } from '../game/room-committer'
import { snapshotToRoom, type Room } from '../game/room'
import { WebPushStore, type PushDelivery } from '../web-push/store'
import { WebPushDelivery } from '../web-push/delivery'

let db: PostgresDatabase
let room: Room
let now: number
let store: WebPushStore
let persistence: PostgresRoomPersistence
const SESSION = ['login-a', 'login-b']
const SITE_USER = ['user-a', 'user-b']

const option = (host: string, suffix: string) => ({
  endpoint: `https://${host}/fcm/send/${suffix}`,
  keys: { p256dh: 'A'.repeat(87), auth: 'A'.repeat(22) },
})

const makeCommitter = () => new RoomCommitter({
  persistence, viewerBuildId: 'test-viewer', gameBuildId: 'test-build', viewerBuildExists: () => true, now: () => now,
})

beforeEach(async () => {
  db = await createTestDatabase()
  now = Date.now()
  store = new WebPushStore(db, () => now)
  persistence = new PostgresRoomPersistence(db)
  for (const [i, userId] of SITE_USER.entries()) {
    await db.prepare('INSERT INTO users(id,username,display_name,password_hash,created_at) VALUES(?,?,?,?,?)')
      .run(userId, userId, userId, 'hash', now)
    await db.prepare('INSERT INTO sessions(token,user_id,expires_at,created_at,auth_policy_version) VALUES(?,?,?,?,?)')
      .run(SESSION[i], userId, now + 10_000_000, now, BROWSER_AUTH_VERSION)
  }
  room = {
    id: randomUUID(),
    session: new GameSession(587, undefined, { playerCount: 2, draftMode: 'simultaneous', draftPoolSize: 7 }),
    players: [], seatOwners: SITE_USER.map((userId, playerIndex) => ({ userId, playerIndex })),
    maxPlayers: 2, version: 0, status: 'playing', startedAt: now,
    replayRecording: true, replayViewerBuildId: 'test-viewer', replayGameBuildId: 'test-build',
  }
})

afterEach(async () => { await db?.close() })

async function subscribe(session: string, endpointSuffix: string) {
  const deviceId = randomUUID()
  await store.bind(session, { deviceId, subscription: option('fcm.googleapis.com', endpointSuffix), locale: 'en', kind: 'draft', enabled: true })
  return deviceId
}

async function play(committer: RoomCommitter, playerIndex: number) {
  const player = room.session.state.players[playerIndex]
  const draft = room.session.state.draft
  if (!player || !draft) throw new Error('Expected a draft player')
  const progress = draftSeatProgress(draft, player.id)
  if (progress.kind !== 'selecting') throw new Error('Player is waiting')
  const pick = firstDraftPick(draft, player.id)
  const intent = replayIntentFromCommand({ type: 'draftSubmit', playerId: player.id, pick })
  if (!intent) throw new Error('Missing draft intent')
  const response = room.session.submitDraftPick(player.id, pick)
  expect(response.ok).toBe(true)
  expect((await committer.commit(room, response, intent, playerIndex)).kind).toBe('committed')
}

it('delivers each initial device reminder once, resumes after restart, and rechecks the recipient on click', async () => {
  await subscribe(SESSION[0]!, 'desktop')
  await subscribe(SESSION[0]!, 'phone')
  const committer = makeCommitter()
  expect((await committer.prepareRoom(room, { missingPrefix: false })).kind).toBe('committed')
  committer.shutdown()
  const restored = await persistence.load(room.id)
  if (!restored) throw new Error('Room was not durable')
  const recovered = makeCommitter()
  const resumed = snapshotToRoom(restored)
  expect((await recovered.prepareRoom(resumed, { missingPrefix: false })).kind).toBe('committed')
  recovered.shutdown()

  const sent: PushDelivery[] = []
  const delivery = new WebPushDelivery(store, async attempt => { sent.push(attempt); return { kind: 'accepted' } }, () => now)
  await delivery.deliverDue(['draft'])
  await delivery.deliverDue(['draft'])
  expect(sent.map(entry => entry.subscription.endpoint).sort()).toEqual([
    'https://fcm.googleapis.com/fcm/send/desktop',
    'https://fcm.googleapis.com/fcm/send/phone',
  ])
  const deliveryId = sent[0]?.deliveryId
  if (!deliveryId) throw new Error('No reminder delivered')
  expect(await store.resolveClick(SESSION[0]!, deliveryId, 'draft')).toEqual({ kind: 'draft', roomId: room.id })
  expect(await store.resolveClick(SESSION[1]!, deliveryId, 'draft')).toEqual({ kind: 'unavailable' })
})

it('drops the spent first reminder and retries only the new waiting-to-selecting transition', async () => {
  await subscribe(SESSION[0]!, 'phone')
  const committer = makeCommitter()
  expect((await committer.prepareRoom(room, { missingPrefix: false })).kind).toBe('committed')
  await play(committer, 0)
  await play(committer, 1)
  await play(committer, 1)

  const sent: Array<{ id: string; ttl: number }> = []
  const delivery = new WebPushDelivery(store, async (attempt, ttl) => {
    sent.push({ id: attempt.deliveryId, ttl })
    return { kind: sent.length === 1 ? 'retry' : 'accepted' }
  }, () => now)
  await delivery.deliverDue(['draft'])
  expect(sent).toHaveLength(1)
  expect(sent[0]?.ttl).toBe(3_600)
  now += 5_000
  await delivery.deliverDue(['draft'])
  expect(sent).toEqual([{ id: sent[0]?.id, ttl: 3_600 }, { id: sent[0]?.id, ttl: 3_595 }])
  await play(committer, 0)
  await delivery.deliverDue(['draft'])
  expect(sent).toHaveLength(2)
  committer.shutdown()
})

it('uses active login binding and stops when the reminder expires or the account switches', async () => {
  const deviceId = await subscribe(SESSION[0]!, 'phone')
  const otherDevice = await subscribe(SESSION[0]!, 'tablet')
  const committer = makeCommitter()
  await committer.prepareRoom(room, { missingPrefix: false })
  expect(await store.preferences(SESSION[1]!, deviceId, option('fcm.googleapis.com', 'phone').endpoint)).toEqual({
    draft: false, 'bug-report-inbox': false,
  })
  const sent: PushDelivery[] = []
  const delivery = new WebPushDelivery(store, async attempt => { sent.push(attempt); return { kind: 'accepted' } }, () => now)
  await delivery.deliverDue(['draft'])
  expect(sent.map(item => item.subscription.endpoint)).toEqual([option('fcm.googleapis.com', 'tablet').endpoint])

  const id = sent[0]?.deliveryId
  if (!id) throw new Error('Missing reminder')
  expect(await store.resolveClick(SESSION[1]!, id, 'draft')).toEqual({ kind: 'unavailable' })
  await play(committer, 0)
  expect(await store.resolveClick(SESSION[0]!, id, 'draft')).toEqual({ kind: 'unavailable' })
  await play(committer, 1)
  now += 3_600_000
  await delivery.deliverDue(['draft'])
  expect(sent).toHaveLength(1)
  await db.prepare('DELETE FROM sessions WHERE user_id=?').run(SITE_USER[0])
  expect(await store.preferences(SESSION[0]!, otherDevice, option('fcm.googleapis.com', 'tablet').endpoint)).toBeNull()
  committer.shutdown()
})
