import { describe, expect, it } from 'vitest'
import { createInitialState } from '../../session/state-bootstrap'
import { executeCardListener, type CardListenerContextInput } from '../card-listeners'
import { A040_PottersYard_impl } from '../A/A040_PottersYard'
import { createTriggerSnapshot } from '../helpers/trigger-snapshot'
import type { GameEvent } from '../../contract/events'

const CARD = 'A040_PottersYard'
const envelope = { schemaVersion: 1, id: 'committed', seq: 1, round: 1, phase: 'work', visibility: 'public' } satisfies Partial<GameEvent>
function setup() {
  const state = createInitialState(42, { playerCount: 2 })
  const player = state.players[0]!
  player.minorPlayed = [CARD]
  player.farmyardSpaceStates = [
    { spaceKey: '0-2', sourceCardId: CARD, kind: 'farmyard-goods-token', resources: { clay: 1 }, claimPolicy: 'when-no-longer-unused' },
  ]
  const context: CardListenerContextInput = {
    state, player, space: state.actionSpaces[0]!, actionId: 'selection', phase: 'after',
    triggerSnapshot: createTriggerSnapshot(state),
  }
  const used: GameEvent = { ...envelope, type: 'farm.spacesUsed', newlyUsedTiles: [{ playerId: player.id, row: 0, col: 2 }] }
  const received: GameEvent = { ...envelope, type: 'resource.moved', resources: { clay: 1 }, sourceCardId: CARD,
    from: { kind: 'card', playerId: player.id, cardId: CARD }, to: { kind: 'player', playerId: player.id }, reason: 'cardEffect' }
  return { state, player, context, used, received }
}
function invoke(context: CardListenerContextInput) {
  return executeCardListener(A040_PottersYard_impl.listeners[0]!, context)
}

describe('Potters Yard committed host facts', () => {
  it('reads its owned token without mutating inventory or positions', () => {
    const { context, state, used } = setup()
    const before = JSON.stringify(state)
    expect(invoke({ ...context, actionEvents: [used] })).toEqual({ sourceCard: CARD, flow: {
      type: 'leaf', actionId: 'special-effect', sourceCard: CARD,
      params: { kind: 'claim-farmyard-goods-tokens', positions: [{ playerId: context.player.id, row: 0, col: 2 }] },
    } })
    expect(JSON.stringify(state)).toEqual(before)
  })

  it.each(['missing-snapshot', 'new-card', 'other-owner', 'draft', 'transaction-only', 'no-token'])('rejects %s geometry', scenario => {
    const { context, used, player, state } = setup()
    let candidate: CardListenerContextInput = { ...context, actionEvents: [used] }
    if (scenario === 'missing-snapshot') candidate.triggerSnapshot = undefined
    if (scenario === 'new-card') candidate.triggerSnapshot = createTriggerSnapshot({ players: [{ ...player, minorPlayed: [] }] })
    if (scenario === 'other-owner') {
      state.players[1]!.minorPlayed = [CARD]
      state.players[1]!.farmyardSpaceStates = structuredClone(player.farmyardSpaceStates)
      candidate.actionEvents = [{ ...used, newlyUsedTiles: [{ playerId: state.players[1]!.id, row: 0, col: 2 }] }]
    }
    if (scenario === 'draft') candidate.actionEvents = [{ type: 'farm.spacesUsed', newlyUsedTiles: used.newlyUsedTiles }]
    if (scenario === 'transaction-only') candidate = { ...candidate, actionEvents: [], transactionEvents: [used] }
    if (scenario === 'no-token') player.farmyardSpaceStates = []
    expect(invoke(candidate)).toBeUndefined()
  })

  it('offers exchange only for actual committed clay on this claim host', () => {
    const { context, received } = setup()
    const result = invoke({ ...context, actionId: 'special-effect', sourceCard: CARD,
      params: { kind: 'claim-farmyard-goods-tokens' }, actionEvents: [received] })
    expect(result?.flow).toMatchObject({ type: 'xor', optional: true, children: [{ type: 'seq', children: [
      { actionId: 'pay', params: { clay: 1 } }, { actionId: 'gain', params: { food: 2 } },
    ] }] })
  })

  it.each(['missing-snapshot', 'new-card', 'foreign-source', 'other-owner', 'draft', 'transaction-only', 'no-clay'])('does not exchange %s receipts', scenario => {
    const { context, received, player, state } = setup()
    const candidate: CardListenerContextInput = { ...context, actionId: 'special-effect', sourceCard: CARD,
      params: { kind: 'claim-farmyard-goods-tokens' }, actionEvents: [received] }
    player.resources.clay = 10
    if (scenario === 'missing-snapshot') candidate.triggerSnapshot = undefined
    if (scenario === 'new-card') candidate.triggerSnapshot = createTriggerSnapshot({ players: [{ ...player, minorPlayed: [] }] })
    if (scenario === 'foreign-source') candidate.actionEvents = [{ ...received, sourceCardId: 'other' }]
    if (scenario === 'other-owner') candidate.actionEvents = [{ ...received, to: { kind: 'player', playerId: state.players[1]!.id } }]
    if (scenario === 'draft') candidate.actionEvents = [{ type: 'resource.moved', resources: { clay: 1 }, sourceCardId: CARD, from: received.from, to: received.to, reason: 'cardEffect' }]
    if (scenario === 'transaction-only') { candidate.actionEvents = []; candidate.transactionEvents = [received] }
    if (scenario === 'no-clay') candidate.actionEvents = [{ ...received, resources: { food: 2 } }]
    expect(invoke(candidate)).toBeUndefined()
  })
})
