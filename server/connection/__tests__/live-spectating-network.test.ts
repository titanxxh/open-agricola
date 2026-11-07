import { once } from 'node:events'
import { GameContextStore } from '../../game/game-context-store'
import { randomUUID } from 'node:crypto'
import { afterEach, expect, it, vi } from 'vitest'
import { createLocalUserForTests, createSession } from '../../auth'
import { createSoloRecoveryHost } from '../../__tests__/_helpers/solo-recovery-network'
import { SoloNetworkPeer } from '../../__tests__/_helpers/formal-solo-network'
import { discoverRoom } from '../../game/room-discovery'
import { roomSpectators } from '../../game/room-spectators'
import type { ClientCommand, ServerEvent } from '../../../shared/contract/protocol/ws'
import type { StateUpdateEnvelope } from '../../../shared/contract/protocol/game'

let host: Awaited<ReturnType<typeof createSoloRecoveryHost>> | undefined
const peers: SoloNetworkPeer[] = []
afterEach(async () => {
  try {
    for (const peer of peers.splice(0)) await peer.close()
  } finally {
    try { await host?.close() } finally { host = undefined; vi.restoreAllMocks(); vi.unstubAllEnvs() }
  }
}, 30_000)

async function game(options: { draft?: boolean; parents?: boolean; privacy?: 'invited' | 'solo' | 'hotseat' } = {}) {
  host = await createSoloRecoveryHost(24)
  const running = host
  const connect = async (name: string) => {
    const user = await createLocalUserForTests(`watch_${name}_${randomUUID().slice(0, 8)}`, 'password123', name)
    const token = await createSession(user.id)
    const peer = await SoloNetworkPeer.connect(running.runtime().url, `oa_session=${token}`)
    peers.push(peer)
    return { user, peer }
  }
  const owner = await running.connect()
  const guest = await connect('guest')
  const viewer = await connect('viewer')
  const allocationId = randomUUID()
  await running.runtime().directory.allocate(`user:${running.user.id}`, allocationId)
  const maxPlayers = options.privacy === 'solo' ? 1 : 2
  const prepared = await owner.prepare({ type: 'createRoom', maxPlayers,
    enableParentCards: options.parents ?? false, draftParents: true, draftMode: options.draft ? 'simultaneous' : undefined,
    hotseat: options.privacy === 'hotseat',
    ...(options.privacy === 'invited' ? { access: { kind: 'invited', invitedUserIds: [guest.user.id] } } : {}),
  }, undefined, allocationId)
  owner.socket.send(JSON.stringify(prepared.command))
  const created = await owner.wait((event): event is Extract<ServerEvent, { type: 'roomCreated' }> => event.type === 'roomCreated')
  const room = running.runtime().backend.registry.get(created.roomId)!
  if (maxPlayers > 1 && options.privacy !== 'hotseat') {
    guest.peer.socket.send(JSON.stringify({ type: 'joinRoom', roomId: room.id, intent: 'join' }))
    await guest.peer.wait((event): event is Extract<ServerEvent, { type: 'roomJoined' }> => event.type === 'roomJoined')
    const confirmation = await guest.peer.prepare({ type: 'confirmPlayerColor' })
    guest.peer.socket.send(JSON.stringify({ ...confirmation.command,
      commandContext: { ...confirmation.identity, roomId: room.id, expectedVersion: room.version } }))
  }
  const opening = await owner.wait((event): event is StateUpdateEnvelope => event.type === 'stateUpdate')
  const read = async (peer: SoloNetworkPeer, command: ClientCommand = { type: 'getState' }) => {
    const requestId = randomUUID()
    peer.socket.send(JSON.stringify({ ...command, requestId }))
    return peer.wait((event): event is StateUpdateEnvelope => event.type === 'stateUpdate' && event.requestId === requestId)
  }
  const watch = async () => {
    const state = await read(viewer.peer, { type: 'spectateRoom', roomId: room.id })
    expect(viewer.peer.events).toContainEqual({ type: 'roomSpectated', roomId: room.id })
    return state
  }
  return { running, room, owner, guest, viewer, opening, read, watch }
}

it('streams public snapshots and history over a third real socket without admitting a seat or recording writes', async () => {
  const { running, room, owner, guest, viewer, opening, read, watch } = await game()
  const facts = async () => ({
    room: await running.db.prepare('SELECT version FROM rooms WHERE id=?').get(room.id),
    replay: await running.db.prepare('SELECT latest_step_no FROM game_replays WHERE room_id=?').get(room.id),
    presence: await running.db.prepare('SELECT connected_count,occupied_count FROM room_presence WHERE room_id=?').get(room.id),
    expiry: await running.db.prepare('SELECT expires_at FROM game_contexts WHERE room_id=?').get(room.id),
    admission: await running.db.prepare('SELECT admission_until FROM room_ownership WHERE room_id=?').get(room.id),
    commands: await running.db.prepare('SELECT count(*) AS count FROM command_requests').get(),
  })
  const before = await facts()
  const route = await discoverRoom(running.runtime().directory, `user:${viewer.user.id}`, { roomId: room.id }, viewer.user.id)
  expect(route.wsPath).toMatch(/^\/nodes\/.+\/ws$/)
  const spectator = await watch()
  expect(await facts()).toEqual(before)
  await read(viewer.peer, { type: 'joinRoom', roomId: room.id, intent: 'join' })
  expect(await facts()).toEqual(before)
  expect(spectator.payload.state).not.toHaveProperty('gameSeed')
  expect(spectator.payload.interaction.allowedCommands).toEqual([])
  expect(spectator.payload).not.toHaveProperty('privateEvents')
  expect(spectator.payload).not.toHaveProperty('cardAvailability')
  expect(spectator.payload.actionAvailability?.farmland).toBe(true)
  const privateIds = room.session.state.players.flatMap(player => [...player.occupationHand, ...player.minorHand])
  expect(privateIds.length).toBeGreaterThan(0)
  for (const id of privateIds) expect(JSON.stringify(spectator)).not.toContain(id)
  for (const command of [
    { type: 'action', spaceId: 'forest' }, { type: 'undoStep' }, { type: 'undoAction' }, { type: 'newGame' },
    { type: 'choice', value: 'confirm' }, { type: 'roundEnd' }, { type: 'loadGame', state: {} },
    { type: 'proposeGameEnd', intent: 'end' }, { type: 'getGameEndProposal' },
  ] satisfies ClientCommand[]) {
    const requestId = randomUUID()
    viewer.peer.socket.send(JSON.stringify({ ...command, requestId }))
    const rejected = await viewer.peer.wait((event): event is Extract<ServerEvent, { type: 'error' }> => event.type === 'error' && event.requestId === requestId)
    expect(rejected.error).toBe('Spectators cannot issue game commands')
  }
  expect(await facts()).toEqual(before)
  const actor = room.players.find(player => player.playerIndex === room.session.state.currentPlayerIndex)!
  const ownerIndex = room.seatOwners!.find(seat => seat.userId === running.user.id)!.playerIndex
  const peer = actor.playerIndex === ownerIndex ? owner : guest.peer
  const moved = await peer.mutate({ type: 'action', spaceId: 'forest' }, opening)
  const updated = await viewer.peer.wait((event): event is StateUpdateEnvelope => event.type === 'stateUpdate' && event.version === moved.state.version)
  expect(updated.payload.state.players[actor.playerIndex]!.resources.wood).toBeGreaterThan(opening.payload.state.players[actor.playerIndex]!.resources.wood)
  viewer.peer.socket.send(JSON.stringify({ type: 'getHistory', requestId: 'history' }))
  const history = await viewer.peer.wait((event): event is Extract<ServerEvent, { type: 'historyPage' }> => event.type === 'historyPage' && event.requestId === 'history')
  for (const id of privateIds) expect(JSON.stringify(history)).not.toContain(id)
  expect(await running.runtime().directory.lobby()).toContainEqual(expect.objectContaining({ id: room.id, canSpectate: true, playerCount: 2 }))
  expect(await running.runtime().backend.authority?.directory.db.prepare('SELECT occupied_count FROM room_presence WHERE room_id=?').get(room.id)).toEqual({ occupied_count: 2 })
  const descriptor = await new GameContextStore(running.db).resolve(room.id, viewer.user.id, 'join')
  expect(descriptor).toMatchObject({ lifecycle: 'active', playerIndex: null })
  expect(await new GameContextStore(running.db).resolve(room.id, viewer.user.id, 'resume')).toMatchObject({ ok: false, code: 'not_participant' })
  await owner.close()
  expect((await read(viewer.peer)).roomId).toBe(room.id)
  await guest.peer.close()
  expect(await viewer.peer.wait((event): event is Extract<ServerEvent, { type: 'spectatingEnded' }> => event.type === 'spectatingEnded'))
    .toEqual({ type: 'spectatingEnded', roomId: room.id, reason: 'offline' })
  await expect.poll(async () => (await running.db.prepare('SELECT expires_at FROM game_contexts WHERE room_id=?').get<{ expires_at: number | null }>(room.id))?.expires_at).toBeTypeOf('number')
  const deadline = await running.db.prepare('SELECT expires_at FROM game_contexts WHERE room_id=?').get(room.id)
  await viewer.peer.close()
  expect(await running.db.prepare('SELECT expires_at FROM game_contexts WHERE room_id=?').get(room.id)).toEqual(deadline)
  await expect(discoverRoom(running.runtime().directory, `user:${viewer.user.id}`, { roomId: room.id }, viewer.user.id)).rejects.toMatchObject({ code: 'not_participant' })
}, 30_000)

it('masks all draft candidates and keeps existing participants in their owned seats', async () => {
  const { running, room, owner, viewer, watch } = await game({ draft: true })
  const state = await watch()
  expect(state.payload.state.phase).toBe('draft')
  const privateIds = room.session.state.draft!.stages.flatMap(stage =>
    Object.values(stage.seats).flatMap(seat => Object.values(seat.inbox).flatMap(pool => [...pool.occ, ...pool.minor])))
  for (const id of privateIds) expect(JSON.stringify(state)).not.toContain(id)
  expect(room.players).toHaveLength(2)
  owner.socket.send(JSON.stringify({ type: 'spectateRoom', roomId: room.id }))
  const restored = await owner.wait((event): event is Extract<ServerEvent, { type: 'roomJoined' }> => event.type === 'roomJoined')
  expect(restored.playerIndex).toBe(room.seatOwners!.find(seat => seat.userId === running.user.id)!.playerIndex)
  expect(roomSpectators(room)).toHaveLength(1)
  expect(viewer.peer.events.filter(event => event.type === 'roomSpectated')).toHaveLength(1)
}, 30_000)

it.each(['invited', 'solo', 'hotseat'] as const)('rejects viewing a %s game through both discovery and the socket', async privacy => {
  const { running, room, viewer } = await game({ privacy })
  await expect(discoverRoom(running.runtime().directory, `user:${viewer.user.id}`, { roomId: room.id }, viewer.user.id))
    .rejects.toMatchObject({ code: 'not_participant' })
  viewer.peer.socket.send(JSON.stringify({ type: 'spectateRoom', roomId: room.id, requestId: 'denied' }))
  expect(await viewer.peer.wait((event): event is Extract<ServerEvent, { type: 'error' }> => event.type === 'error' && event.requestId === 'denied'))
    .toMatchObject({ code: 'not_participant' })
  expect(viewer.peer.events.some(event => event.type === 'stateUpdate' || event.type === 'roomSpectated')).toBe(false)
}, 30_000)

it.each(['end', 'rematch'] as const)('ends spectating at agreed %s without following a replacement game', async intent => {
  const { room, owner, guest, viewer, opening, watch } = await game()
  const originalId = room.id
  await watch()
  const propose = await owner.prepare({ type: 'proposeGameEnd', intent }, opening)
  owner.socket.send(JSON.stringify(propose.command))
  const proposal = await guest.peer.wait((event): event is Extract<ServerEvent, { type: 'gameEndProposal' }> => event.type === 'gameEndProposal' && event.proposal !== null)
  const agreement = await guest.peer.prepare({ type: 'respondGameEnd', proposalId: proposal.proposal!.id, agree: true }, opening)
  guest.peer.socket.send(JSON.stringify(agreement.command))
  expect(await viewer.peer.wait((event): event is Extract<ServerEvent, { type: 'spectatingEnded' }> => event.type === 'spectatingEnded'))
    .toEqual({ type: 'spectatingEnded', roomId: originalId, reason: 'terminated' })
  await viewer.peer.close()
  expect(viewer.peer.events.some(event => event.type === 'roomJoined' || event.type === 'roomWaiting')).toBe(false)
  expect(viewer.peer.events.filter(event => event.type === 'stateUpdate').every(event => event.roomId === originalId)).toBe(true)
  expect(roomSpectators(room)).toHaveLength(0)
}, 30_000)


it('delivers the committed final public frame before stopping live viewing', async () => {
  const { running, room, viewer, watch } = await game()
  await watch()
  const final = room.session.loadState({ ...room.session.state, gameOver: true, round: 14 })
  expect((await running.runtime().backend.committer!.commit(room, final, { commandType: 'test-completion', intentJson: '{}' }, 0)).kind).toBe('committed')
  await running.runtime().backend.broadcaster.broadcastCommitted(room, final, 'reconnect')
  expect(await viewer.peer.wait((event): event is Extract<ServerEvent, { type: 'spectatingEnded' }> => event.type === 'spectatingEnded'))
    .toEqual({ type: 'spectatingEnded', roomId: room.id, reason: 'completed' })
  const frames = viewer.peer.events.filter((event): event is StateUpdateEnvelope => event.type === 'stateUpdate')
  expect(frames.at(-1)?.payload.state.gameOver).toBe(true)
  expect(await new GameContextStore(running.db).resolve(room.id)).toMatchObject({ lifecycle: 'completed', replayStatus: 'available' })
}, 30_000)


it('disconnects spectators with a retryable close when the room owner lease is lost', async () => {
  const { running, room, viewer, watch } = await game()
  await watch()
  const closed = once(viewer.peer.socket, 'close')
  await running.db.prepare('UPDATE room_ownership SET lease_until=0 WHERE room_id=?').run(room.id)
  const [code] = await closed
  expect(code).toBe(1012)
  expect(roomSpectators(room)).toHaveLength(0)
}, 15_000)

it('hides private parent candidates while publishing selection progress', async () => {
  const { room, watch } = await game({ parents: true })
  const state = await watch()
  expect(state.payload.state.phase).toBe('parent-selection')
  const candidates = room.session.state.parentSelection!.candidates
  const ids = Object.values(candidates).flatMap(pair => [...pair.mother, ...pair.father])
  expect(ids.length).toBeGreaterThan(0)
  for (const id of ids) expect(JSON.stringify(state)).not.toContain(id)
}, 30_000)
