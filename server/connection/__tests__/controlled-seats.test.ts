import { describe, expect, it, vi } from 'vitest'
import { firstDraftPick } from '../../../shared/draft/__tests__/draft-fixtures'
import { draftSeatProgress } from '../../../shared/projections/draft-progress'
import { recordedRouterFixture } from '../../__tests__/_helpers/room-router'
import { removePlayerFromRoom, snapshotToRoom } from '../../game/room'
import { ReplayStore } from '../../game/replay-store'
import { createConnectionCtx } from '../connection-ctx'

const { newDeps, dispatch } = recordedRouterFixture()

const client = (deps: ReturnType<typeof newDeps>, userId: string) => {
  const ws = { OPEN: 1, readyState: 1, send: vi.fn(), close: vi.fn() }
  return createConnectionCtx(ws as never, deps, true, userId)
}

const sharedSeats = async (options: { draft?: boolean; parents?: boolean } = {}) => {
  const deps = newDeps()
  const clients = ['host', 'second', 'third', 'fourth'].map(userId => client(deps, userId))
  const host = clients[0]!
  await dispatch(host, { type: 'createRoom', maxPlayers: 4,
    ...(options.draft ? { draftMode: 'simultaneous', draftPoolSize: 7 } : {}),
    ...(options.parents ? { enableParentCards: true } : {}),
  })
  const room = host.currentRoom!
  for (const peer of clients.slice(1)) await dispatch(peer, { type: 'joinRoom', roomId: room.id })
  expect(room.status).toBe('playing')
  removePlayerFromRoom(room, clients[2]!.ws)
  room.seatOwners = room.seatOwners!.map(owner => owner.playerIndex === 2 ? { ...owner, userId: host.currentUserId! } : owner)
  return { deps, host, room, clients }
}

describe('connection controlled seats', () => {
  it('accepts draft input for either owned seat and rejects an opponent seat', async () => {
    const { host, room } = await sharedSeats({ draft: true })
    const ownPick = firstDraftPick(room.session.state.draft!, 'p3')
    await dispatch(host, { type: 'draftSubmit', playerId: 'p3', pick: ownPick })
    expect(draftSeatProgress(room.session.state.draft!, 'p3').kept).toEqual({
      occ: [ownPick.occCardId], minor: [ownPick.minorCardId],
    })
    const foreignPick = firstDraftPick(room.session.state.draft!, 'p2')
    await dispatch(host, { type: 'draftSubmit', playerId: 'p2', pick: foreignPick })
    expect(draftSeatProgress(room.session.state.draft!, 'p2').kept).toEqual({ occ: [], minor: [] })
    expect(host.ws.send).toHaveBeenCalledWith(expect.stringContaining('seat mismatch: you cannot act on another player'))
  })

  it('accepts parent selections only for owned seats', async () => {
    const { host, room, clients } = await sharedSeats({ parents: true })
    expect(room.session.state.phase).toBe('parent-selection')
    const candidates = room.session.state.parentSelection!.candidates.p3
    const selection = { mother: candidates.mother[0]!, father: candidates.father[0]! }
    await dispatch(clients[1]!, { type: 'parentSubmit', playerIndex: 2, selection })
    expect(room.session.state.parentSelection!.submissions.p3).toBeNull()
    await dispatch(host, { type: 'parentSubmit', playerIndex: 2, selection })
    expect(room.session.state.parentSelection!.submissions.p3).toEqual(selection)
    expect(room.session.state.parentSelection!.submissions.p1).toBeNull()
  })

  it('rebuilds control from retained ownership and continues a partially submitted draft after reconnecting', async () => {
    const { deps, host, room } = await sharedSeats({ draft: true })
    const secondPick = firstDraftPick(room.session.state.draft!, 'p3')
    await dispatch(host, { type: 'draftSubmit', playerId: 'p3', pick: secondPick })
    await deps.checkpoint.recordMeta(room)
    const saved = await deps.persistence.load(room.id)
    if (!saved) throw new Error('Missing committed room')
    const restored = snapshotToRoom(saved)
    deps.registry.set(restored)
    room.session.dispose()
    expect((await deps.committer.prepareRoom(restored, { missingPrefix: true })).kind).toBe('committed')
    const resumed = client(deps, 'host')
    await dispatch(resumed, { type: 'joinRoom', roomId: room.id, intent: 'resume' })
    expect([...resumed.controlledPlayerIndices]).toEqual([0, 2])
    const firstPick = firstDraftPick(restored.session.state.draft!, 'p1')
    await dispatch(resumed, { type: 'draftSubmit', playerId: 'p1', pick: firstPick })
    expect(draftSeatProgress(restored.session.state.draft!, 'p1').kept).toEqual({
      occ: [firstPick.occCardId], minor: [firstPick.minorCardId],
    })
    expect(draftSeatProgress(restored.session.state.draft!, 'p3').kept).toEqual({
      occ: [secondPick.occCardId], minor: [secondPick.minorCardId],
    })
    const version = restored.version
    await dispatch(resumed, { type: 'draftSubmit', playerId: 'p2', pick: firstDraftPick(restored.session.state.draft!, 'p2') })
    expect(restored.version).toBe(version)
    expect(draftSeatProgress(restored.session.state.draft!, 'p2').kept).toEqual({ occ: [], minor: [] })
  })

  it('executes and undoes the waiting owned seat, recording that seat as the replay actor', async () => {
    const { host, room, clients, deps } = await sharedSeats()
    await dispatch(host, { type: 'action', spaceId: 'day-laborer' })
    await dispatch(host, { type: 'choice', value: 'confirm' })
    expect(room.session.state.currentPlayerIndex).toBe(1)
    const before = room.version
    await dispatch(host, { type: 'action', spaceId: 'farmland' })
    expect(room.version).toBe(before)
    expect(host.ws.send).toHaveBeenCalledWith(expect.stringContaining('seat mismatch: you cannot act on another player'))
    await dispatch(clients[1]!, { type: 'action', spaceId: 'forest' })
    await dispatch(clients[1]!, { type: 'choice', value: 'confirm' })
    expect(room.session.state.currentPlayerIndex).toBe(2)
    await dispatch(host, { type: 'action', spaceId: 'farmland' })
    expect(room.session.getInteraction()).toMatchObject({ stateId: 'wait', playerIndex: 2 })
    expect(room.session.state.actionSpaces.find(space => space.id === 'farmland')!.takenBy).toEqual([{ playerId: 'p3', workerId: '1' }])
    await dispatch(host, { type: 'undoAction' })
    expect(room.session.state.actionSpaces.find(space => space.id === 'farmland')!.takenBy).toEqual([])
    await dispatch(host, { type: 'proposeGameEnd', intent: 'end' })
    const proposalId = room.endProposal!.id
    for (const peer of [clients[1]!, clients[3]!]) await dispatch(peer, { type: 'respondGameEnd', proposalId, agree: true })
    const replay = await new ReplayStore(deps.commands.db).manifest(room.id)
    if (!replay.ok) throw new Error(replay.message)
    expect(replay.steps.slice(-2).map(step => ({ playerIndex: step.playerIndex, commandType: step.commandType })))
      .toEqual([{ playerIndex: 2, commandType: 'action' }, { playerIndex: 2, commandType: 'undoAction' }])
  })

  it.each(['propose', 'respond'])('records one account confirmation for all of its seats when it must %s', async action => {
    const { host, room, clients, deps } = await sharedSeats()
    const proposer = action === 'propose' ? host : clients[1]!
    await dispatch(proposer, { type: 'proposeGameEnd', intent: 'end' })
    const proposal = room.endProposal!
    if (action === 'propose') {
      expect(proposal.agreements.map(vote => vote.playerIndex)).toEqual([0, 2])
      await dispatch(clients[1]!, { type: 'respondGameEnd', proposalId: proposal.id, agree: true })
    } else {
      await dispatch(host, { type: 'respondGameEnd', proposalId: proposal.id, agree: true })
      expect(room.endProposal!.agreements.map(vote => vote.playerIndex)).toEqual([1, 0, 2])
    }
    expect(await deps.gameContextStore.lifecycle(room.id)).toBe('active')
    await dispatch(clients[3]!, { type: 'respondGameEnd', proposalId: proposal.id, agree: true })
    expect(await deps.gameContextStore.resolve(room.id)).toMatchObject({ lifecycle: 'terminated', termination: {
      reason: 'agreement', players: [
        { playerIndex: 0 }, { playerIndex: 1 }, { playerIndex: 2 }, { playerIndex: 3 },
      ],
    } })
  })
})
