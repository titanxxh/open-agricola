import { randomUUID } from 'node:crypto'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { ClientCommand } from '../../../shared/contract/protocol/ws'
import * as database from '../../db'
import { createTestDatabase } from '../../__tests__/_helpers/postgres'
import { recordingResources } from '../../__tests__/_helpers/recording'
import { RoomRegistry } from '../../game/room-registry'
import { PostgresRoomPersistence } from '../../game/persistence/postgres-adapter'
import { createRoomPersistenceCheckpoint } from '../../game/room-persistence-checkpoint'
import { RoomCommitter, type RoomCommitScheduler } from '../../game/room-committer'
import { CommandStore } from '../../game/command-store'
import { drainRoomWork } from '../../game/room-queue'
import { createLobby } from '../../game/lobby'
import { Broadcaster } from '../broadcaster'
import { createConnectionCtx, type ConnectionCtx } from '../connection-ctx'
import { dispatch as runDispatch } from '../room-router'
import { approveCurrentDraft, createCard, publish } from '../../workshop-drafts'

const fakeWs = () => ({ OPEN: 1, readyState: 1, send: vi.fn(), close: vi.fn() })
const messages = (ctx: ConnectionCtx): Array<Record<string, unknown>> =>
  vi.mocked(ctx.ws.send).mock.calls.map(([raw]) => JSON.parse(raw as string)).filter(event => event.type !== 'commandReceipt')
let db: Awaited<ReturnType<typeof createTestDatabase>>
let recording: Awaited<ReturnType<typeof recordingResources>>
let persistence: PostgresRoomPersistence
let registry: RoomRegistry
let committer: RoomCommitter
let host: ConnectionCtx
let guest: ConnectionCtx
let context: (userId: string) => ConnectionCtx
let dispatch: (ctx: ConnectionCtx, command: ClientCommand) => Promise<void>
const tasks: Array<{ callback: () => void; delay: number }> = []
const scheduler: RoomCommitScheduler = {
  setTimeout(callback, delay) { const task = { callback, delay }; tasks.push(task); return task },
  clearTimeout(handle) { const index = tasks.indexOf(handle as typeof tasks[number]); if (index >= 0) tasks.splice(index, 1) },
}

beforeEach(async () => {
  db = await createTestDatabase()
  vi.spyOn(database, 'getDb').mockReturnValue(db)
  recording = await recordingResources(db)
  for (const id of ['u1', 'u2']) await db.prepare("INSERT INTO users(id,username,display_name,password_hash,created_at) VALUES(?,?,?,'hash',1)").run(id, id, id)
  persistence = new PostgresRoomPersistence(db)
  registry = new RoomRegistry()
  const checkpoint = createRoomPersistenceCheckpoint({ persistence })
  const broadcaster = new Broadcaster()
  const commands = new CommandStore(db)
  committer = new RoomCommitter({ persistence, ...recording.replay, resources: recording.resources, viewerBuildExists: async id => !!await recording.resources.viewer(id), scheduler })
  const deps = { registry, checkpoint, broadcaster, commands, committer, gameContextStore: recording.gameContextStore, lobby: createLobby({ registry, checkpoint, broadcaster }) }
  context = userId => createConnectionCtx(fakeWs() as never, deps, true, userId)
  const scopes = new Map(await Promise.all(['u1', 'u2'].map(async id => [id, await commands.issueScope(`user:${id}`)] as const)))
  dispatch = (ctx, command) => runDispatch(ctx, ['joinRoom', 'getState'].includes(command.type) ? command : {
    ...command,
    commandContext: { scopeId: scopes.get(ctx.currentUserId!)!.scopeId, commandId: randomUUID(),
      ...(command.type === 'createRoom' ? {} : { roomId: ctx.currentRoom!.id, expectedVersion: ctx.currentRoom!.version, inputWindowId: ctx.currentRoom?.inputWindow?.id }) },
  })
  host = context('u1'); guest = context('u2')
})
afterEach(async () => {
  committer?.shutdown()
  await drainRoomWork()
  for (const room of registry?.iter() ?? []) { registry.delete(room.id); room.session.dispose() }
  await recording?.close()
  await db?.close()
  tasks.length = 0
  vi.restoreAllMocks()
})

async function createWaiting() {
  await dispatch(host, { type: 'createRoom', maxPlayers: 2, name: 'Host', enableParentCards: false })
  expect(host.currentRoom).not.toBeNull()
  for (const player of host.currentRoom!.session.state.players) { player.minorHand = ['__test_placeholder__']; player.occupationHand = ['__test_placeholder__'] }
  return host.currentRoom!
}

it('keeps Step 0, the persisted names and successful join publication behind the PostgreSQL commit', async () => {
  const room = await createWaiting()
  await dispatch(host, { type: 'action', spaceId: 'forest', requestId: 'waiting' })
  expect(messages(host)).toContainEqual(expect.objectContaining({ type: 'error', requestId: 'waiting' }))
  expect(await persistence.loadReplayHead(room.id)).toBeNull()
  vi.mocked(host.ws.send).mockClear()
  let release!: () => void
  let enter!: () => void
  const entered = new Promise<void>(done => { enter = done })
  const gate = new Promise<void>(done => { release = done })
  const commit = persistence.commitReplay.bind(persistence)
  vi.spyOn(persistence, 'commitReplay').mockImplementationOnce(value => db.transaction(async () => {
    const result = await commit(value)
    enter(); await gate
    return result
  })())
  const joining = dispatch(guest, { type: 'joinRoom', roomId: room.id, name: 'Guest' })
  try {
    await Promise.race([entered, joining.then(() => { throw new Error('Join did not reach Step 0 commit') })])
    expect(messages(host)).toEqual([])
    expect(messages(guest)).toEqual([])
    expect(await persistence.loadReplayHead(room.id)).toBeNull()
  } finally { release(); await joining }
  expect((await persistence.loadReplayHead(room.id))?.latestStepNo).toBe(0)
  expect((await persistence.load(room.id))?.serialized?.state.players.map(player => player.name)).toEqual(['Host', 'Guest'])
  expect(messages(guest).map(event => event.type)).toEqual(['roomJoined', 'playerJoined', 'stateUpdate', 'gameStarted'])
})

it('retains an action for retry and keeps later input and seat reconnect behind its durable publication', async () => {
  const room = await createWaiting()
  await dispatch(guest, { type: 'joinRoom', roomId: room.id, name: 'Guest' })
  const actor = room.session.state.currentPlayerIndex === 0 ? host : guest
  const other = actor === host ? guest : host
  vi.mocked(host.ws.send).mockClear(); vi.mocked(guest.ws.send).mockClear()
  await dispatch(other, { type: 'action', spaceId: 'forest', requestId: 'wrong-seat' })
  expect(messages(actor)).toEqual([])
  expect(messages(other)).toContainEqual(expect.objectContaining({ type: 'stateUpdate', version: 0, requestId: 'wrong-seat' }))
  vi.mocked(host.ws.send).mockClear(); vi.mocked(guest.ws.send).mockClear()
  vi.spyOn(persistence, 'commitReplay').mockRejectedValueOnce(new Error('temporary persistence error'))
  const action = dispatch(actor, { type: 'action', spaceId: 'forest', requestId: 'action-1' })
  let queued: Promise<void> | undefined
  let joining: Promise<void> | undefined
  const reconnect = context(other.currentUserId!)
  try {
    await vi.waitFor(() => expect(messages(actor).map(event => event.type)).toEqual(['roomPersistencePaused']))
    expect(messages(other).map(event => event.type)).toEqual(['roomPersistencePaused'])
    expect((await persistence.loadReplayHead(room.id))?.latestStepNo).toBe(0)
    expect(tasks.map(task => task.delay)).toEqual([1000])
    queued = dispatch(actor, { type: 'action', spaceId: 'reed-bank', requestId: 'queued-input' })
    joining = dispatch(reconnect, { type: 'joinRoom', roomId: room.id, name: 'Renamed Guest', requestId: 'reconnect' })
    expect(reconnect.currentRoom).toBeNull()
    expect(messages(reconnect)).toEqual([])
  } finally {
    await tasks.shift()?.callback()
    await action; await queued; await joining
  }
  expect(messages(actor)).toContainEqual(expect.objectContaining({ type: 'error', requestId: 'queued-input', code: 'command_input_stale' }))
  expect(messages(other).map(event => event.type)).toEqual(['roomPersistencePaused', 'stateUpdate', 'roomPersistenceResumed', 'seat_replaced'])
  expect(other.ws.close).toHaveBeenCalledWith(4001, 'seat replaced')
  expect(messages(reconnect).map(event => event.type)).toEqual(['roomJoined', 'playerJoined', 'stateUpdate'])
  expect(reconnect.currentRoom).toBe(room)
  expect(room.version).toBe(1)
  expect((await persistence.loadReplayHead(room.id))?.latestStepNo).toBe(1)
  const receipt = vi.mocked(actor.ws.send).mock.calls.map(([raw]) => JSON.parse(String(raw))).find(event => event.type === 'commandReceipt' && event.requestId === 'action-1')
  expect(receipt).toMatchObject({ status: 'completed', receipt: { outcome: { ok: true, roomVersion: 1, stepNo: 1 } } })
})

it('loads only published community cards when the room enables the community deck', async () => {
  const draft = await createCard(db, { authorId: 'u1', draft: {
    cardId: 'CUSTOM_Published', cardType: 'minor', name: 'Published', description: 'Published',
    cardJson: { id: 'CUSTOM_Published', name: 'Published', card_type: 'minor', deck: 'CUSTOM', number: 1, desc: ['Published'] },
    effectCode: null, compiledCode: null, codeManifest: null, artUrl: null, generation: {},
  } as never })
  await dispatch(host, { type: 'createRoom', maxPlayers: 2, customCardIds: [draft.id], enableCommunityDeck: true, requestId: 'unpublished' })
  expect(host.currentRoom).toBeNull()
  expect(messages(host)).toContainEqual(expect.objectContaining({ type: 'error', requestId: 'unpublished' }))
  await approveCurrentDraft(db, { cardId: draft.id, authorId: 'u1' })
  await publish(db, { cardId: draft.id, authorId: 'u1', baseRevision: draft.revision })
  await dispatch(host, { type: 'createRoom', maxPlayers: 2, customCardIds: [draft.id] })
  expect(host.currentRoom?.customCardDbIds).toEqual([])
  await dispatch(host, { type: 'dissolveRoom' })
  await dispatch(host, { type: 'createRoom', maxPlayers: 2, customCardIds: [draft.id], enableCommunityDeck: true })
  expect(host.currentRoom?.customCardDbIds).toEqual([draft.id])
  expect(host.currentRoom?.customCards).toHaveLength(1)
})
