import { randomUUID } from 'node:crypto'
import { afterEach, expect, it, vi } from 'vitest'
import { createLocalUserForTests, createSession } from '../../auth'
import { createSoloRecoveryHost } from '../../__tests__/_helpers/solo-recovery-network'
import { SoloNetworkPeer } from '../../__tests__/_helpers/formal-solo-network'
import { firstDraftPick } from '../../../shared/draft/__tests__/draft-fixtures'
import { draftSeatProgress } from '../../../shared/projections/draft-progress'
import type { ClientCommand, ServerEvent } from '../../../shared/contract/protocol/ws'
import type { StateUpdateEnvelope } from '../../../shared/contract/protocol/game'
import { ReplayStore } from '../../game/replay-store'

let running: Awaited<ReturnType<typeof createSoloRecoveryHost>> | undefined
const guests: SoloNetworkPeer[] = []
afterEach(async () => {
  try { for (const guest of guests.splice(0)) await guest.close() }
  finally { try { await running?.close() } finally { running = undefined; vi.restoreAllMocks(); vi.unstubAllEnvs() } }
}, 30_000)

const read = async (peer: SoloNetworkPeer): Promise<StateUpdateEnvelope> => {
  const requestId = randomUUID()
  peer.socket.send(JSON.stringify({ type: 'getState', requestId }))
  return peer.wait((event): event is StateUpdateEnvelope => event.type === 'stateUpdate' && event.requestId === requestId)
}

it('plays two real accounts through simultaneous opening, recovers both seats and publishes whole-team presence', async () => {
  running = await createSoloRecoveryHost(42)
  const host = running
  let owner = await host.connect()
  const other = await createLocalUserForTests(`multihand_${randomUUID().slice(0, 8)}`, 'password123', 'Other farmer')
  const token = await createSession(other.id)
  let guest = await SoloNetworkPeer.connect(host.runtime().url, `oa_session=${token}`)
  guests.push(guest)
  const allocationId = randomUUID()
  await host.runtime().directory.allocate(`user:${host.user.id}`, allocationId)
  const creation = await owner.prepare({ type: 'createRoom', maxPlayers: 4,
    teamConfig: { mode: 'multihand', seatsPerTeam: 2, seating: 'separated', scoring: 'category-min' },
    draftMode: 'simultaneous', draftPoolSize: 7, enableParentCards: true, draftParents: true, enableSnakeOpening: true,
  }, undefined, allocationId)
  owner.socket.send(JSON.stringify(creation.command))
  const waiting = await owner.wait((event): event is Extract<ServerEvent, { type: 'teamRoomWaiting' }> => event.type === 'teamRoomWaiting')
  let room = host.runtime().backend.registry.get(waiting.roomId)!
  guest.socket.send(JSON.stringify({ type: 'joinRoom', roomId: room.id }))
  await guest.wait((event): event is Extract<ServerEvent, { type: 'teamRoomWaiting' }> => event.type === 'teamRoomWaiting')
  const start = await owner.prepare({ type: 'startTeamGame' })
  owner.socket.send(JSON.stringify({ ...start.command, commandContext: { ...start.identity, roomId: room.id, expectedVersion: room.version } }))
  const joined = await owner.wait((event): event is Extract<ServerEvent, { type: 'roomJoined' }> => event.type === 'roomJoined')
  expect(joined.controlledPlayerIndexes).toEqual([0, 2])
  const initial = await read(owner)
  expect(initial.payload.state.phase).toBe('draft')
  expect(initial.payload.state.draft!.stages[0]!.seats.p3!.inbox[1]!.occ).not.toContain('?')
  expect(initial.payload.state.draft!.stages[0]!.seats.p2!.inbox[1]!.occ).toEqual(Array(7).fill('?'))
  const beforeIllegal = room.version
  const foreign = await read(guest)
  const wrong = await owner.prepare({ type: 'draftSubmit', playerId: 'p2', pick: firstDraftPick(foreign.payload.state.draft!, 'p2') }, initial)
  owner.socket.send(JSON.stringify(wrong.command))
  const denied = await owner.wait((event): event is Extract<ServerEvent, { type: 'commandReceipt' }> => event.type === 'commandReceipt' && event.requestId === wrong.requestId)
  expect(denied).toMatchObject({ status: 'completed', receipt: { outcome: { ok: false, error: 'seat mismatch: you cannot act on another player' } } })
  expect(room.version).toBe(beforeIllegal)

  for (let step = 0; room.session.state.phase === 'draft'; step++) {
    if (step > 40) throw new Error('Simultaneous draft did not finish')
    const state = await read(owner)
    const next = state.payload.state.draft!.seatOrder.find(id => draftSeatProgress(state.payload.state.draft!, id).kind === 'selecting')!
    const index = room.session.state.players.findIndex(player => player.id === next)
    const actor = index % 2 === 0 ? owner : guest
    const own = await read(actor)
    await actor.mutate({ type: 'draftSubmit', playerId: next, pick: firstDraftPick(own.payload.state.draft!, next) }, own)
  }
  expect(room.session.state.phase).toBe('parent-selection')
  for (const index of [0, 1, 2, 3]) {
    const actor = index % 2 === 0 ? owner : guest
    const own = await read(actor)
    const candidates = own.payload.state.parentSelection!.candidates[`p${index + 1}`]!
    expect(candidates.mother).not.toContain('?')
    await actor.mutate({ type: 'parentSubmit', playerIndex: index,
      selection: { mother: candidates.mother[0]!, father: candidates.father[0]! } }, own)
  }
  expect(room.session.state).toMatchObject({ phase: 'playing', round: 1, roundPhase: 'work' })
  for (const [index, spaceId] of [[0, 'forest'], [1, 'clay-pit'], [2, 'reed-bank']] as const) {
    const actor = index % 2 === 0 ? owner : guest
    const state = await read(actor)
    expect(state.payload.state.currentPlayerIndex).toBe(index)
    await actor.mutate({ type: 'action', spaceId }, state)
    if (index < 2) await actor.mutate({ type: 'choice', value: 'confirm' }, await read(actor))
  }

  await guest.close()
  for (const index of [1, 3]) await owner.wait((event): event is Extract<ServerEvent, { type: 'playerDisconnected' }> =>
    event.type === 'playerDisconnected' && event.playerIndex === index)
  expect((await read(owner)).connectedPlayerIndexes).toEqual([0, 2])
  guest = await SoloNetworkPeer.connect(host.runtime().url, `oa_session=${token}`)
  guests.push(guest)
  guest.socket.send(JSON.stringify({ type: 'joinRoom', roomId: room.id, intent: 'resume' }))
  const restored = await guest.wait((event): event is Extract<ServerEvent, { type: 'roomJoined' }> => event.type === 'roomJoined')
  expect(restored.controlledPlayerIndexes).toEqual([1, 3])
  expect((await read(guest)).payload.state.players[3]!.minorHand).not.toContain('?')
  for (const index of [1, 3]) await owner.wait((event): event is Extract<ServerEvent, { type: 'playerJoined' }> =>
    event.type === 'playerJoined' && event.playerIndex === index)
  expect((await read(owner)).connectedPlayerIndexes).toEqual([0, 1, 2, 3])

  await guest.close()
  const recovered = await host.rebuild(room.id)
  owner = recovered.peer
  room = host.runtime().backend.registry.get(room.id)!
  expect(recovered.state.payload.state.team).toEqual(initial.payload.state.team)
  expect(owner.events).toContainEqual(expect.objectContaining({ type: 'roomJoined', controlledPlayerIndexes: [0, 2] }))
  expect(recovered.state.payload.state.players[2]!.minorHand).not.toContain('?')
  expect(recovered.state.payload.state.players[1]!.minorHand).toEqual(Array(7).fill('?'))
  guest = await SoloNetworkPeer.connect(host.runtime().url, `oa_session=${token}`)
  guests.push(guest)
  guest.socket.send(JSON.stringify({ type: 'joinRoom', roomId: room.id, intent: 'resume' }))
  const afterRestart = await guest.wait((event): event is Extract<ServerEvent, { type: 'roomJoined' }> => event.type === 'roomJoined')
  expect(afterRestart.controlledPlayerIndexes).toEqual([1, 3])
  expect((await read(guest)).payload.state.players[3]!.occupationHand).not.toContain('?')

  const vote = async (peer: SoloNetworkPeer, command: ClientCommand) => {
    const prepared = await peer.prepare(command, await read(peer))
    peer.socket.send(JSON.stringify(prepared.command))
    const receipt = await peer.wait((event): event is Extract<ServerEvent, { type: 'commandReceipt' }> =>
      event.type === 'commandReceipt' && event.requestId === prepared.requestId)
    expect(receipt).toMatchObject({ status: 'completed', receipt: { outcome: { ok: true } } })
  }
  await vote(owner, { type: 'proposeGameEnd', intent: 'end' })
  expect(room.endProposal!.agreements.map(consent => consent.playerIndex)).toEqual([0, 2])
  const proposal = room.endProposal!
  await vote(guest, { type: 'respondGameEnd', proposalId: proposal.id, agree: true })
  await guest.wait((event): event is Extract<ServerEvent, { type: 'gameTerminated' }> => event.type === 'gameTerminated')
  const replay = await new ReplayStore(host.db).manifest(room.id)
  expect(replay.ok).toBe(true)
  if (!replay.ok) throw new Error(replay.message)
  expect(replay.steps.filter(step => step.commandType === 'action').map(step => step.playerIndex)).toEqual([0, 1, 2])
}, 30_000)
