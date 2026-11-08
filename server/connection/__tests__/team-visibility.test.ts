import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as rng from '../../../shared/utils/rng'
import type { ServerEvent } from '../../../shared/contract/protocol/ws'
import { recordedRouterFixture } from '../../__tests__/_helpers/room-router'
import { createConnectionCtx, type ConnectionCtx } from '../connection-ctx'
import { addRoomSpectator } from '../../game/room-spectators'
import type { SessionResponse } from '../../game/authoritative-session'
import { firstDraftPick } from '../../../shared/draft/__tests__/draft-fixtures'
import { draftSeatProgress } from '../../../shared/projections/draft-progress'

const { newDeps, dispatch } = recordedRouterFixture()
const client = (deps: ReturnType<typeof newDeps>, userId: string) => createConnectionCtx(
  { OPEN: 1, readyState: 1, send: vi.fn(), close: vi.fn() } as never, deps, true, userId,
)
const messages = (peer: ConnectionCtx): ServerEvent[] => vi.mocked(peer.ws.send).mock.calls.map(([raw]) => JSON.parse(String(raw)))
const snapshot = (peer: ConnectionCtx) => {
  const envelope = messages(peer).findLast(event => event.type === 'stateUpdate')
  if (!envelope || envelope.type !== 'stateUpdate') throw new Error('Missing room snapshot')
  return envelope.payload
}
const seatOf = (peer: ConnectionCtx) => {
  const binding = messages(peer).findLast(event => event.type === 'roomJoined')
  if (!binding || binding.type !== 'roomJoined') throw new Error('Missing seat binding')
  return binding.playerIndex
}
beforeEach(() => {
  const resolveSeed = rng.resolveSeed
  vi.spyOn(rng, 'resolveSeed').mockImplementation(seed => resolveSeed(seed ?? 42))
})

async function teamRoom(visibility: 'shared' | 'private') {
  const deps = newDeps()
  const peers = ['host', 'teammate', 'opponent-a', 'opponent-b'].map(id => client(deps, id))
  const host = peers[0]!
  await dispatch(host, { type: 'createRoom', maxPlayers: 4, name: 'Host',
    teamConfig: { mode: 'team', seatsPerTeam: 2, seating: 'separated', scoring: 'sum', teammateVisibility: visibility } })
  const room = host.currentRoom!
  for (const peer of peers.slice(1)) await dispatch(peer, { type: 'joinRoom', roomId: room.id, name: peer.currentUserId })
  await dispatch(host, { type: 'startTeamGame' })
  expect(room.status).toBe('playing')
  const state = room.session.state
  for (const [index, player] of state.players.entries()) {
    player.occupationHand = [`occupation-${index}`]
    player.minorHand = [`minor-${index}`]
    player.cardStates = { [`occupation-${index}`]: { privateData: { secret: `seat-${index}` } } }
  }
  room.session.loadState(state)
  const spectator = client(deps, 'spectator')
  addRoomSpectator(room, spectator.ws)
  return { deps, room, peers, host, spectator }
}

describe('teammate visibility', () => {
  it('does not grant idle actions or permission to submit a teammate turn', async () => {
    const { room, host, peers } = await teamRoom('shared')
    const teammate = peers[1]!
    const actor = seatOf(teammate)
    const state = room.session.state
    state.currentPlayerIndex = actor
    state.players[actor]!.occupationHand = ['A110_Roughcaster', 'A131_CraftTeacher']
    room.session.loadState(state)
    await host.broadcaster.broadcastCommitted(room, room.session.getState(), 'reconnect')
    expect(snapshot(host).interaction).toMatchObject({ stateId: 'idle', allowedCommands: [], anytimeActions: [] })
    expect(snapshot(teammate).interaction.allowedCommands).toContain('takeAction')
    const version = room.version
    const before = JSON.stringify(room.session.state)
    for (const peer of peers) vi.mocked(peer.ws.send).mockClear()
    await dispatch(host, { type: 'action', spaceId: 'forest' })
    await dispatch(host, { type: 'choice', value: 'confirm' })
    expect(messages(host).filter(message => message.type === 'error')).toHaveLength(2)
    expect(messages(host).filter(message => message.type === 'error').map(message => message.error))
      .toEqual(['seat mismatch: you cannot act on another player', 'seat mismatch: you cannot act on another player'])
    expect(JSON.stringify(room.session.state)).toBe(before)
    expect(room.version).toBe(version)
    expect(peers.slice(1).every(peer => vi.mocked(peer.ws.send).mock.calls.length === 0)).toBe(true)
    await dispatch(teammate, { type: 'action', spaceId: 'lessons' })
    expect(room.version).toBeGreaterThan(version)
    expect(snapshot(host).interaction).toMatchObject({ stateId: 'wait', playerIndex: actor, request: { kind: 'choice' }, allowedCommands: [], anytimeActions: [] })
    expect(snapshot(teammate).interaction.allowedCommands).toContain('resolveChoice')
  })

  it.each(['shared', 'private'] as const)('uses the same %s audience for live history and getHistory', async visibility => {
    const { room, peers, host, spectator } = await teamRoom(visibility)
    room.session.state.log = room.session.state.players.map((player, index) => ({
      key: 'private-card-history', playerId: player.id, params: { cardId: `occupation-${index}` },
    }))
    room.session.loadState(room.session.state)
    await host.broadcaster.broadcastCommitted(room, room.session.getState(), 'reconnect')
    for (const peer of peers) {
      await dispatch(peer, { type: 'getHistory' })
      const page = messages(peer).findLast(message => message.type === 'historyPage')
      if (!page || page.type !== 'historyPage') throw new Error('Missing room history')
      const own = seatOf(peer)
      const team = room.session.state.team!.playerTeams[own]
      const expected = room.session.state.players.flatMap((_, index) => index === own
        || visibility === 'shared' && room.session.state.team!.playerTeams[index] === team ? [`occupation-${index}`] : [])
      expect(page.page.log.map(entry => entry.params?.cardId)).toEqual(expected)
      expect(snapshot(peer).state.log.map(entry => entry.params?.cardId)).toEqual(expected)
      expect(page.page.window.branchId).toBe(snapshot(peer).historyWindow?.branchId)
    }
    expect(snapshot(spectator).state.log).toEqual([])
  })

  it.each(['draft', 'parents'] as const)('retains owned simultaneous %s input and rejects teammate submissions', async opening => {
    const deps = newDeps()
    const peers = ['host', 'mate', 'left', 'right'].map(id => client(deps, id))
    const host = peers[0]!
    await dispatch(host, { type: 'createRoom', maxPlayers: 4,
      teamConfig: { mode: 'team', seatsPerTeam: 2, seating: 'separated', scoring: 'sum', teammateVisibility: 'shared' },
      ...(opening === 'draft' ? { draftMode: 'simultaneous', draftPoolSize: 7 } : { enableParentCards: true }),
    })
    const room = host.currentRoom!
    for (const peer of peers.slice(1)) await dispatch(peer, { type: 'joinRoom', roomId: room.id })
    await dispatch(host, { type: 'startTeamGame' })
    const own = seatOf(host)
    const other = seatOf(peers[1]!)
    if (opening === 'draft') {
      const ownId = room.session.state.players[own]!.id
      const otherId = room.session.state.players[other]!.id
      const pick = firstDraftPick(room.session.state.draft!, ownId)
      await dispatch(host, { type: 'draftSubmit', playerId: ownId, pick })
      expect(draftSeatProgress(room.session.state.draft!, ownId).kept).toEqual({ occ: [pick.occCardId], minor: [pick.minorCardId] })
      await dispatch(host, { type: 'draftSubmit', playerId: otherId, pick: firstDraftPick(room.session.state.draft!, otherId) })
      expect(draftSeatProgress(room.session.state.draft!, otherId).kept).toEqual({ occ: [], minor: [] })
    } else {
      const candidates = room.session.state.parentSelection!.candidates[room.session.state.players[own]!.id]!
      const selection = { mother: candidates.mother[0]!, father: candidates.father[0]! }
      await dispatch(host, { type: 'parentSubmit', playerIndex: own, selection })
      expect(room.session.state.parentSelection!.submissions[room.session.state.players[own]!.id]).toEqual(selection)
      await dispatch(host, { type: 'parentSubmit', playerIndex: other, selection })
      expect(room.session.state.parentSelection!.submissions[room.session.state.players[other]!.id]).toBeNull()
    }
    expect(messages(host)).toContainEqual(expect.objectContaining({ type: 'error', error: 'seat mismatch: you cannot act on another player' }))
  })

  it.each(['shared', 'private'] as const)('keeps prompt visibility and capability separate under %s sharing', async visibility => {
    const { room, host, peers, spectator } = await teamRoom(visibility)
    const actor = seatOf(peers[1]!)
    const sourceCard = `occupation-${actor}`
    const response: SessionResponse = { ...room.session.getState(), interaction: {
      stateId: 'wait', playerIndex: actor, sourceCard, promptKey: 'ui.privateTeamChoice',
      request: { kind: 'resource-batch-exchange-select', cardId: sourceCard, discardAvailableByResource: { wood: 1 }, receiveResources: ['clay'], maxTotal: 1 },
      allowedCommands: ['commitSelection', 'undoStep', 'takeAnytimeAction'],
      anytimeActions: [{ id: 'private-anytime', labelKey: 'ui.interactionConfirm' }],
    }, privateEvents: [{ schemaVersion: 1, type: 'private.handChanged', recipientPlayerId: `p${actor + 1}`,
      cardIds: ['private-team-draw'], cardType: 'occupation', reason: 'card-effect' }] }
    await host.broadcaster.broadcastCommitted(room, response, 'choice')
    const shared = snapshot(host)
    expect(shared.interaction.allowedCommands).toEqual([])
    expect(shared.interaction.anytimeActions).toEqual([])
    if (visibility === 'shared') {
      expect(shared.interaction).toMatchObject({ stateId: 'wait', playerIndex: actor, sourceCard,
        request: { kind: 'resource-batch-exchange-select', cardId: sourceCard } })
      expect(shared.privateEvents).toMatchObject([
        { type: 'private.promptShown', recipientPlayerId: `p${actor + 1}`, sourceCard },
        { type: 'private.handChanged', cardIds: ['private-team-draw'] },
      ])
    } else {
      expect(shared.interaction).toMatchObject({ request: { kind: 'private-prompt' } })
      expect(JSON.stringify(shared)).not.toContain(sourceCard)
      expect(shared).not.toHaveProperty('privateEvents')
    }
    expect(snapshot(peers[1]!).interaction.allowedCommands).toEqual(['commitSelection', 'undoStep', 'takeAnytimeAction'])
    expect(snapshot(peers[1]!).interaction.anytimeActions).toEqual([{ id: 'private-anytime', labelKey: 'ui.interactionConfirm' }])
    for (const peer of [peers[2]!, peers[3]!, spectator]) {
      expect(snapshot(peer).interaction).toMatchObject({ request: { kind: 'private-prompt' }, allowedCommands: [], anytimeActions: [] })
      expect(JSON.stringify(snapshot(peer))).not.toContain(sourceCard)
      expect(snapshot(peer)).not.toHaveProperty('privateEvents')
    }
  })

  it.each(['shared', 'private'] as const)('projects four real accounts and a spectator under %s visibility', async visibility => {
    const { room, host, peers, spectator } = await teamRoom(visibility)
    await host.broadcaster.broadcastCommitted(room, room.session.getState(), 'reconnect')
    for (const peer of peers) {
      const payload = snapshot(peer)
      const own = seatOf(peer)
      const team = room.session.state.team!.playerTeams[own]
      for (const [index, player] of payload.state.players.entries()) {
        const visible = own === index || visibility === 'shared' && room.session.state.team!.playerTeams[index] === team
        expect(player.occupationHand).toEqual([visible ? `occupation-${index}` : '?'])
        expect(player.minorHand).toEqual([visible ? `minor-${index}` : '?'])
        expect(player.cardStates).toEqual(visible ? { [`occupation-${index}`]: { privateData: { secret: `seat-${index}` } } } : {})
      }
    }
    expect(snapshot(spectator).state.players.map(player => player.occupationHand)).toEqual([['?'], ['?'], ['?'], ['?']])
    expect(snapshot(spectator).state.players.every(player => Object.keys(player.cardStates).length === 0)).toBe(true)
  })
})
