import { describe, expect, it } from 'vitest'
import { runCardEffectHook } from '../card-effects'
import type { GameState, PlayerState, ActionFlow } from '../../game/types'

import '../B/B4_WoodPile'

const CARD_ID = 'B4_WoodPile'

const makePlayer = (id = 'p1'): PlayerState =>
  ({
    id, name: 'P1', color: 'red',
    resources: { wood: 0, clay: 0, reed: 0, stone: 0, food: 0, grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0 },
    workers: [],
    rooms: 2, houseType: 'wood',
    fields: [], fences: 0, roomTiles: [], stableTiles: [],
    improvements: [], minorHand: [], minorPlayed: [],
    occupationHand: [], occupationPlayed: [],
    houseAnimalType: null, houseAnimalCount: 0, stableAnimals: {},
    pastures: [], fenceSegments: [],
    majorEffects: { wellRounds: 0 }, startPlayer: false,
    activeModifiers: [], cardStates: {},
  }) as unknown as PlayerState

const makeState = (player: PlayerState): GameState =>
  ({
    round: 3, roundPhase: 'work', currentPlayerIndex: 0,
    players: [player],
    actionSpaces: [
      // accumulation spaces (gainPerRound non-empty)
      { id: 'forest', gainPerRound: { wood: 3 }, resources: { wood: 9 }, takenBy: [{ playerId: 'p1', workerId: 'w1' }] },
      { id: 'clay-pit', gainPerRound: { clay: 1 }, resources: { clay: 3 }, takenBy: [{ playerId: 'p1', workerId: 'w2' }] },
      { id: 'reed-bank', gainPerRound: { reed: 1 }, resources: { reed: 3 }, takenBy: [] },
      // non-accumulation (gainPerRound empty)
      { id: 'farmland', gainPerRound: {}, resources: {}, takenBy: [{ playerId: 'p1', workerId: 'w3' }] },
      // accumulation occupied by a different player
      { id: 'fishing', gainPerRound: { food: 1 }, resources: {}, takenBy: [{ playerId: 'p2', workerId: 'wA' }] },
    ],
    log: [], roundStartSnapshot: null,
    roundActionOrder: Array.from({ length: 14 }).map(() => null),
    gameSeed: 1, availableMajorImprovements: [],
    futureMeeples: [], pendingFutureMeeples: [],
    gameOver: false, workPhaseObtainedResources: {},
  }) as unknown as GameState

describe('B4_WoodPile onBuy', () => {
  it('grants wood equal to count of accumulation spaces with my farmer (BGA)', () => {
    const player = makePlayer('p1')
    const state = makeState(player)
    const flow = runCardEffectHook(state, player, CARD_ID, 'onBuy')
    // forest + clay-pit are accumulation spaces with my farmer → wood: 2
    expect(flow).not.toBeNull()
    const leaf = flow as Extract<ActionFlow, { type: 'leaf' }>
    expect(leaf.actionId).toBe('gain')
    expect(leaf.params).toMatchObject({ wood: 2 })
  })

  it('skips non-accumulation farmer placements (e.g. farmland)', () => {
    const player = makePlayer('p1')
    const state = makeState(player)
    // remove my forest farmer; clay-pit only → wood: 1
    state.actionSpaces[0]!.takenBy = []
    const flow = runCardEffectHook(state, player, CARD_ID, 'onBuy')
    const leaf = flow as Extract<ActionFlow, { type: 'leaf' }>
    expect(leaf.params).toMatchObject({ wood: 1 })
  })

  it('returns nothing when no farmers of mine on accumulation spaces', () => {
    const player = makePlayer('p1')
    const state = makeState(player)
    state.actionSpaces[0]!.takenBy = []
    state.actionSpaces[1]!.takenBy = []
    const flow = runCardEffectHook(state, player, CARD_ID, 'onBuy')
    expect(flow).toBeNull()
  })

  it('does not count opponent farmers on accumulation spaces', () => {
    const player = makePlayer('p1')
    const state = makeState(player)
    state.actionSpaces[0]!.takenBy = []
    state.actionSpaces[1]!.takenBy = []
    // only p2 has a farmer on fishing — count for p1 should be 0
    const flow = runCardEffectHook(state, player, CARD_ID, 'onBuy')
    expect(flow).toBeNull()
  })
})
