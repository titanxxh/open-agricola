import { randomUUID } from 'node:crypto'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { BROWSER_AUTH_VERSION } from '../../shared/contract/browser-auth'
import { firstDraftPick } from '../../shared/draft/__tests__/draft-fixtures'
import { draftSeatProgress } from '../../shared/projections/draft-progress'
import { createTestDatabase } from './_helpers/postgres'
import type { PostgresDatabase } from '../database/postgres'
import { createOpeningSession, createWorkSession } from './_helpers/session-fixtures'
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
    session: createOpeningSession({ seed: 587, options: { playerCount: 2, draftMode: 'simultaneous', draftPoolSize: 7 },
      expected: { phase: 'draft', roundPhase: 'work', interaction: { stateId: 'idle' } } }),
    players: [], seatOwners: SITE_USER.map((userId, playerIndex) => ({ userId, playerIndex })),
    maxPlayers: 2, version: 0, status: 'playing', startedAt: now,
    replayRecording: true, replayViewerBuildId: 'test-viewer', replayGameBuildId: 'test-build',
  }
})

afterEach(async () => { room?.session.dispose(); await db?.close() })

async function subscribe(session: string, endpointSuffix: string, kind: 'turn' | 'draft' = 'draft') {
  const deviceId = randomUUID()
  await store.preferences(session, deviceId, null)
  await store.bind(session, { deviceId, subscription: option('fcm.googleapis.com', endpointSuffix), locale: 'en', kind, enabled: true })
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
    if (sent.length === 1) throw new Error('Provider outcome unknown')
    return { kind: 'accepted' }
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
    turn: false, draft: false, 'bug-report-inbox': false,
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

it('keeps one continuous draft reminder when a Moor stage immediately advances', async () => {
  room.session.dispose()
  room.session = createOpeningSession({ seed: 587,
    options: { playerCount: 2, draftMode: 'simultaneous', draftPoolSize: 7, enableFarmersOfTheMoor: true },
    expected: { phase: 'draft', roundPhase: 'work', interaction: { stateId: 'idle' } } })
  await subscribe(SESSION[0]!, 'phone')
  const committer = makeCommitter()
  expect((await committer.prepareRoom(room, { missingPrefix: false })).kind).toBe('committed')
  const sent: PushDelivery[] = []
  const delivery = new WebPushDelivery(store, async attempt => { sent.push(attempt); return { kind: 'accepted' } }, () => now)
  await delivery.deliverDue(['draft'])

  for (let i = 0; i < 10; i++) {
    await play(committer, 1)
    await play(committer, 0)
    const draft = room.session.state.draft
    const player = room.session.state.players[0]
    if (!draft || !player) throw new Error('Missing Moor draft')
    const progress = draftSeatProgress(draft, player.id)
    expect(progress.kind).toBe('selecting')
    if (progress.kind === 'selecting' && progress.stageIndex === 1) {
      await delivery.deliverDue(['draft'])
      expect(sent).toHaveLength(1)
      committer.shutdown()
      return
    }
  }
  throw new Error('Moor draft did not advance')
})

it('does not deliver any notification from a rolled back Room transaction', async () => {
  await subscribe(SESSION[0]!, 'phone')
  const committer = makeCommitter()
  await expect(db.transaction(async () => {
    expect((await committer.prepareRoom(room, { missingPrefix: false })).kind).toBe('committed')
    throw new Error('Commit aborted')
  })()).rejects.toThrow('Commit aborted')
  committer.shutdown()

  const sent: PushDelivery[] = []
  const delivery = new WebPushDelivery(store, async attempt => { sent.push(attempt); return { kind: 'accepted' } }, () => now)
  await delivery.deliverDue(['draft'])
  expect(sent).toEqual([])
  expect(await persistence.load(room.id)).toBeNull()
})

it('does not revive a retired device if an old account still has a session', async () => {
  const deviceId = await subscribe(SESSION[0]!, 'shared-browser')
  await store.unbind(deviceId)
  const options = { deviceId, subscription: option('fcm.googleapis.com', 'shared-browser'), locale: 'en',
    kind: 'draft', enabled: true } as const
  expect(await store.bind(SESSION[0]!, options)).toBeNull()
  expect(await store.preferences(SESSION[1]!, deviceId, options.subscription.endpoint)).toEqual({
    turn: false, draft: false, 'bug-report-inbox': false,
  })
  const nextDevice = randomUUID()
  await store.preferences(SESSION[1]!, nextDevice, null)
  expect(await store.bind(SESSION[1]!, { ...options, deviceId: nextDevice })).toEqual({
    turn: false, draft: true, 'bug-report-inbox': false,
  })
})

it('retires a reserved browser before its first subscription write arrives', async () => {
  const deviceId = randomUUID()
  const options = { deviceId, subscription: option('fcm.googleapis.com', 'first-device'), locale: 'en',
    kind: 'draft', enabled: true } as const
  expect(await store.preferences(SESSION[0]!, deviceId, null)).toEqual({
    turn: false, draft: false, 'bug-report-inbox': false,
  })

  await store.preferences(SESSION[0]!, randomUUID(), null)
  await store.unbind(deviceId)
  expect(await store.bind(SESSION[0]!, options)).toBeNull()

  const newDevice = randomUUID()
  await store.unbind(newDevice)
  await store.preferences(SESSION[0]!, newDevice, null)
  expect(await store.bind(SESSION[0]!, { ...options, deviceId: newDevice })).toEqual({
    turn: false, draft: true, 'bug-report-inbox': false,
  })
})

it('counts active browser subscriptions per account across sessions and categories', async () => {
  const account = SITE_USER[0]!
  const phone = await subscribe(SESSION[0]!, 'phone', 'turn')
  const preferences = { deviceId: phone, subscription: option('fcm.googleapis.com', 'phone'), locale: 'en' }
  await store.bind(SESSION[0]!, { ...preferences, enabled: true, kind: 'draft' })
  await store.preferences(SESSION[0]!, randomUUID(), null)
  await subscribe(SESSION[1]!, 'other')
  await db.prepare('INSERT INTO sessions(token,user_id,expires_at,created_at,auth_policy_version) VALUES(?,?,?,?,?)')
    .run('second-login', account, now + 1000, now, BROWSER_AUTH_VERSION)
  await subscribe('second-login', 'laptop')
  expect(await store.accountDeviceCount(SESSION[0]!, account)).toBe(2)
  expect(await store.accountDeviceCount(SESSION[1]!, account)).toBeNull()
  now += 1000
  expect(await store.accountDeviceCount(SESSION[0]!, account)).toBe(1)
  await store.bind(SESSION[0]!, { ...preferences, enabled: false, kind: 'draft' })
  expect(await store.accountDeviceCount(SESSION[0]!, account)).toBe(1)
  await store.bind(SESSION[0]!, { ...preferences, enabled: false, kind: 'turn' })
  expect(await store.accountDeviceCount(SESSION[0]!, account)).toBe(0)
})

it('notifies the actual responder once, including a reaction to another player’s action', async () => {
  room.session.dispose()
  room.session = createWorkSession({ configure: state => {
    const responder = state.players[1]!
    responder.occupationPlayed = ['A128_RiparianBuilder']
    Object.assign(responder.resources, { wood: 5, clay: 10, reed: 6 })
    state.actionSpaces.find(space => space.id === 'reed-bank')!.resources.reed = 3
  } })
  await subscribe(SESSION[0]!, 'first', 'turn')
  await subscribe(SESSION[1]!, 'second', 'turn')
  await subscribe(SESSION[1]!, 'draft-only')
  const sent: PushDelivery[] = []
  const delivery = new WebPushDelivery(store, async item => { sent.push(item); return { kind: 'accepted' } }, () => now)
  const committer = makeCommitter()
  try {
    expect((await committer.prepareRoom(room, { missingPrefix: false })).kind).toBe('committed')
    await delivery.deliverDue(['turn'])
    expect(sent.map(x => x.subscription.endpoint)).toEqual([option('fcm.googleapis.com', 'first').endpoint])
    const first = sent[0]!.deliveryId
    expect(await store.resolveClick(SESSION[0]!, first, 'turn')).toEqual({ kind: 'turn', roomId: room.id })
    expect(await store.resolveClick(SESSION[1]!, first, 'turn')).toEqual({ kind: 'unavailable' })
    const action = room.session.takeAction(0, 'reed-bank')
    expect(action.interaction).toMatchObject({ stateId: 'wait', playerIndex: 0 })
    expect((await committer.commit(room, action, { commandType: 'takeAction', intentJson: '{}' }, 0)).kind).toBe('committed')
    const reaction = room.session.resolveChoice(0, 'confirm')
    expect(reaction.interaction).toMatchObject({ stateId: 'wait', playerIndex: 1 })
    expect(reaction.state.currentPlayerIndex).toBe(0)
    expect((await committer.commit(room, reaction, { commandType: 'choice', intentJson: '{}' }, 0)).kind).toBe('committed')
    expect(await store.resolveClick(SESSION[0]!, first, 'turn')).toEqual({ kind: 'unavailable' })
    await delivery.deliverDue(['turn'])
    expect(sent.map(x => x.subscription.endpoint)).toEqual(['first', 'second'].map(s => option('fcm.googleapis.com', s).endpoint))
    expect(await store.resolveClick(SESSION[1]!, sent[1]!.deliveryId, 'turn')).toEqual({ kind: 'turn', roomId: room.id })
    const returning = room.session.resolveChoice(1, '__skip__')
    expect(returning.interaction).toMatchObject({ stateId: 'wait', playerIndex: 1 })
    expect((await committer.commit(room, returning, { commandType: 'choice', intentJson: '{}' }, 1)).kind).toBe('committed')
    await delivery.deliverDue(['turn'])
    expect(sent).toHaveLength(2)
  } finally { committer.shutdown() }
})
