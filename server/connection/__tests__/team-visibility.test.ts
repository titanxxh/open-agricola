import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as rng from '../../../shared/utils/rng'
import type { ServerEvent } from '../../../shared/contract/protocol/ws'
import { recordedRouterFixture } from '../../__tests__/_helpers/room-router'
import { createConnectionCtx, type ConnectionCtx } from '../connection-ctx'
import { addRoomSpectator } from '../../game/room-spectators'
import type { SessionResponse } from '../../game/authoritative-session'

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
  it('shares a teammate prompt and private events without sharing command or anytime capability', async () => {
    const { room, host, peers, spectator } = await teamRoom('shared')
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
    expect(shared.interaction).toMatchObject({ stateId: 'wait', playerIndex: actor, sourceCard,
      request: { kind: 'resource-batch-exchange-select', cardId: sourceCard }, allowedCommands: [], anytimeActions: [] })
    expect(shared.privateEvents).toMatchObject([
      { type: 'private.promptShown', recipientPlayerId: `p${actor + 1}`, sourceCard },
      { type: 'private.handChanged', cardIds: ['private-team-draw'] },
    ])
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
