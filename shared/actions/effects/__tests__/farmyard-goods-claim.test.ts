import { describe, expect, it } from 'vitest'
import { specialEffectAction } from '../special-effect'
import { receiveAction } from '../receive'
import { createInitialState } from '../../../session/state-bootstrap'
import { getWorkPhaseBuildingResources } from '../../../session/work-phase-resources'
import { readCardResourceStats } from '../../../cards/helpers/card-state'
import type { DraftGameEvent, EventSink } from '../../../contract/events'

function setup() {
  const state = createInitialState(42, { playerCount: 2 })
  state.roundPhase = 'work'
  const player = state.players[0]!
  player.farmyardSpaceStates = [
    { spaceKey: '0-2', sourceCardId: 'source', kind: 'farmyard-goods-token', resources: { clay: 1 }, claimPolicy: 'when-no-longer-unused' },
    { spaceKey: '1-2', sourceCardId: 'source', kind: 'farmyard-goods-token', resources: { clay: 1 }, claimPolicy: 'when-no-longer-unused' },
    { spaceKey: '0-2', sourceCardId: 'other', kind: 'farmyard-goods-token', resources: { food: 1 }, claimPolicy: 'when-no-longer-unused' },
  ]
  const events: DraftGameEvent[] = []
  const eventSink: EventSink = { emit: event => events.push(event), emitMany: batch => events.push(...batch) }
  return { state, player, events, context: { state, player, space: state.actionSpaces[0]!, sourceCard: 'source', eventSink } }
}

describe('farmyard goods claim effect', () => {
  it.each(['work', 'preparation'] as const)('records actual claimed goods once in %s phase', phase => {
    const { context, state, player, events } = setup()
    state.roundPhase = phase
    state.players[1]!.farmyardSpaceStates = structuredClone(player.farmyardSpaceStates)
    const otherTokens = structuredClone(state.players[1]!.farmyardSpaceStates)
    const claim = { ...context, params: { kind: 'claim-farmyard-goods-tokens', positions: [{ row: 0, col: 2 }, { row: 0, col: 2 }] } }
    expect(specialEffectAction.execute(claim)).toEqual({ type: 'ok' })
    expect(specialEffectAction.execute(claim)).toEqual({ type: 'ok' })
    expect(player.resources.clay).toBe(1)
    expect(state.players[1]!.farmyardSpaceStates).toEqual(otherTokens)
    expect(state.players[1]!.resources.clay).toBe(0)
    expect(player.farmyardSpaceStates?.map(token => [token.sourceCardId, token.spaceKey])).toEqual([['source', '1-2'], ['other', '0-2']])
    expect(readCardResourceStats(player, 'source')?.gained).toEqual({ clay: 1 })
    expect(player.stats?.resourcesFromCards.clay).toBe(1)
    expect(getWorkPhaseBuildingResources(state, player.id)).toBe(phase === 'work' ? 1 : 0)
    expect(events).toEqual([{ type: 'resource.moved', resources: { clay: 1 }, sourceCardId: 'source',
      from: { kind: 'card', playerId: player.id, cardId: 'source' }, to: { kind: 'player', playerId: player.id }, reason: 'cardEffect' }])
  })

  it.each([null, [{ row: 0.5, col: 2 }], [{ row: 0, col: '2' }], '0-2'])('rejects malformed coordinate scope %j atomically', positions => {
    const { context, state, events } = setup()
    const before = JSON.stringify(state)
    expect(specialEffectAction.execute({ ...context, params: { kind: 'claim-farmyard-goods-tokens', positions } })).toEqual({ type: 'fail', errorKey: 'log.specialEffectFail' })
    expect(JSON.stringify(state)).toEqual(before)
    expect(events).toEqual([])
  })

  it('does not sweep live used tiles when an explicit empty host scope was supplied', () => {
    const { context, player, events } = setup()
    player.fields = [{ row: 0, col: 2, stacks: [] }]
    expect(specialEffectAction.execute({ ...context, params: { kind: 'claim-farmyard-goods-tokens', positions: [] } })).toEqual({ type: 'ok' })
    expect(player.farmyardSpaceStates).toHaveLength(3)
    expect(player.resources.clay).toBe(0)
    expect(events).toEqual([])
  })

  it('does not emit a scheduled room fact if the farm has no available space', () => {
    const { context, state, player, events } = setup()
    player.houseType = 'stone'
    player.fields = [0, 1, 2].flatMap(row => [0, 1, 2, 3, 4].map(col => ({ row, col, stacks: [] })))
      .filter(tile => !player.roomTiles.some(room => room.row === tile.row && room.col === tile.col))
    state.futureMeeples = [{ id: 'room', playerId: player.id, cardId: 'scheduled-room', round: state.round, actionId: null, roomType: 'stone', resources: {} }]
    expect(receiveAction.execute({ ...context, params: { futureMeepleIds: ['room'] } })).toEqual({ type: 'ok', resourcesGained: {} })
    expect(player.rooms).toBe(2)
    expect(events.map(event => event.type)).toEqual(['futureMeeple.resolved'])
    expect(state.futureMeeples).toEqual([])
  })
})
