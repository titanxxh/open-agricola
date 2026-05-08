import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { getRegisteredCardListeners, type CardListenerRegistration } from '../../../cards/card-listeners'
import { resolveCardCostWithModifiers } from '../../payment/internal'
import type { GameState, PlayerState, ComplexCost } from '../../../contract/types'
import { CardRegistry } from '../../../../shared/cards/registry'
import { setActiveCardRegistry, requireActiveCardRegistry } from '../../../../shared/cards/active-registry'

// Snapshot + restore approach: avoid blowing away module-level listeners
// registered by other cards (e.g. D95_SiteManager) when this test file runs
// in the same process as session tests that depend on them.
let snapshot: CardListenerRegistration[] = []
const snapshotListeners = () => {
  snapshot = getRegisteredCardListeners()
}
const restoreListeners = () => {
  const fresh = new CardRegistry()
  setActiveCardRegistry(fresh)
  snapshot.forEach((l) => fresh.registerListener(l))
}

const createPlayer = (): PlayerState =>
  ({
    id: 'p1',
    name: 'P1',
    color: 'red',
    resources: {
      wood: 0, clay: 0, reed: 0, stone: 0, food: 0,
      grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0,
    },
    rooms: 2,
    houseType: 'wood',
    fields: [],
    fences: 0,
    roomTiles: [],
    stableTiles: [],
    improvements: [],
    minorHand: [],
    minorPlayed: [],
    occupationHand: [],
    occupationPlayed: [],
    houseAnimalType: null,
    houseAnimalCount: 0,
    stableAnimals: {},
    pastures: [],
    fenceSegments: [],
    majorEffects: { wellRounds: 0 },
    startPlayer: false,
    activeModifiers: [],
    cardStates: {},
  }) as unknown as PlayerState

const createState = (player: PlayerState): GameState =>
  ({
    players: [player],
    currentPlayerIndex: 0,
  }) as unknown as GameState

describe('resolveCardCostWithModifiers', () => {
  beforeEach(() => {
    snapshotListeners()
  })

  afterEach(() => {
    restoreListeners()
  })

  it('returns base cost unchanged when no listeners match', () => {
    const player = createPlayer()
    const state = createState(player)
    const result = resolveCardCostWithModifiers(
      state, player, 'improvement-any', 'Major_Basket', { reed: 2, stone: 2 },
    )
    expect(result).toEqual({ reed: 2, stone: 2 })
  })

  it('accumulates multiple costs deltas (order-independent)', () => {
    const player = createPlayer()
    player.occupationPlayed = ['HookA', 'HookB']
    const state = createState(player)

    requireActiveCardRegistry('resolveCardCostWithModifiers').registerListener({
      id: 'hook-a', cardIds: ['HookA'], phases: ['computeCosts'],
      actions: ['improvement-any'],
      handler: () => ({ costs: { stone: -1 } }),
    })
    requireActiveCardRegistry('resolveCardCostWithModifiers').registerListener({
      id: 'hook-b', cardIds: ['HookB'], phases: ['computeCosts'],
      actions: ['improvement-any'],
      handler: () => ({ costs: { reed: -1 } }),
    })

    const result = resolveCardCostWithModifiers(
      state, player, 'improvement-any', 'Major_Basket', { reed: 2, stone: 2 },
    )
    expect(result).toEqual({ reed: 1, stone: 1 })
  })

  it('pushes trades returned by hooks into ComplexCost.trades', () => {
    const player = createPlayer()
    player.occupationPlayed = ['HookTrade']
    const state = createState(player)

    requireActiveCardRegistry('resolveCardCostWithModifiers').registerListener({
      id: 'hook-trade', cardIds: ['HookTrade'], phases: ['computeCosts'],
      actions: ['improvement-any'],
      handler: () => ({ trades: [{ from: { wood: 1 }, to: { clay: 2 }, max: 1 }] }),
    })

    const result = resolveCardCostWithModifiers(
      state, player, 'improvement-any', 'Major_Test', { clay: 2 },
    ) as ComplexCost
    expect(result.fee).toEqual({ clay: 2 })
    expect(result.trades).toHaveLength(1)
    expect(result.trades![0]!.to).toEqual({ clay: 2 })
  })

  it('pushes bonuses returned by hooks into ComplexCost.bonuses', () => {
    const player = createPlayer()
    player.occupationPlayed = ['HookBonus']
    const state = createState(player)

    requireActiveCardRegistry('resolveCardCostWithModifiers').registerListener({
      id: 'hook-bonus', cardIds: ['HookBonus'], phases: ['computeCosts'],
      actions: ['improvement-any'],
      handler: () => ({ bonuses: [{ discount: { stone: 1 }, sources: ['HookBonus'] }] }),
    })

    const result = resolveCardCostWithModifiers(
      state, player, 'improvement-any', 'Major_Test', { stone: 2 },
    ) as ComplexCost
    expect(result.bonuses).toHaveLength(1)
    expect(result.bonuses![0]!.discount).toEqual({ stone: 1 })
  })

  it('preserves bonus.choices field when returned from hook', () => {
    const player = createPlayer()
    player.occupationPlayed = ['HookChoices']
    const state = createState(player)

    requireActiveCardRegistry('resolveCardCostWithModifiers').registerListener({
      id: 'hook-choices', cardIds: ['HookChoices'], phases: ['computeCosts'],
      actions: ['improvement-any'],
      handler: () => ({
        bonuses: [{
          choices: [
            { discount: { clay: 2 } },
            { discount: { stone: 2 } },
          ],
          optional: true,
          sources: ['HookChoices'],
        }],
      }),
    })

    const result = resolveCardCostWithModifiers(
      state, player, 'improvement-any', 'Major_Test', { clay: 2, stone: 2 },
    ) as ComplexCost
    expect(result.bonuses).toHaveLength(1)
    expect(result.bonuses![0]!.choices).toHaveLength(2)
    expect(result.bonuses![0]!.optional).toBe(true)
  })

  it('combines costs, trades, and bonuses from the same hook', () => {
    const player = createPlayer()
    player.occupationPlayed = ['HookMulti']
    const state = createState(player)

    requireActiveCardRegistry('resolveCardCostWithModifiers').registerListener({
      id: 'hook-multi', cardIds: ['HookMulti'], phases: ['computeCosts'],
      actions: ['improvement-any'],
      handler: () => ({
        costs: { reed: -1 },
        trades: [{ from: { wood: 1 }, to: { clay: 1 } }],
        bonuses: [{ discount: { stone: 1 } }],
      }),
    })

    const result = resolveCardCostWithModifiers(
      state, player, 'improvement-any', 'Major_Test', { reed: 2, clay: 1, stone: 1 },
    ) as ComplexCost
    expect(result.fee).toEqual({ reed: 1, clay: 1, stone: 1 })
    expect(result.trades).toHaveLength(1)
    expect(result.bonuses).toHaveLength(1)
  })
})
