import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { getRegisteredCardListeners, type CardListenerRegistration } from '../../card-listeners'
import {
  STUB_BONUS_CHOICES_CARD,
  stubBonusChoicesListener,
} from '../Stub_BonusChoices'
import {
  stubBonusChoiceModifier,
} from '../Stub_BonusChoiceModifier'
import { PaymentSolver } from '../../../actions/payment'
import {
  computePaymentOptionsForTest,
  resolveCardCostForTest,
} from '../../../actions/payment/__tests__/test-helpers'
import type { GameState, PlayerState, ComplexCost } from '../../../contract/types'
import { CardRegistry } from '../../registry'
import { setActiveCardRegistry, requireActiveCardRegistry } from '../../active-registry'

// Snapshot + restore approach: avoid blowing away module-level listeners
// registered by other cards (e.g. D095_SiteManager) when this test file runs
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
      wood: 5, clay: 5, reed: 5, stone: 5, food: 5,
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

describe('bonus.choices multi-path matrix', () => {
  beforeEach(() => {
    snapshotListeners()
    PaymentSolver.clearCache()
  })
  afterEach(() => {
    restoreListeners()
    PaymentSolver.clearCache()
  })

  it('Path A hook with bonus.choices expands payment combinations', () => {
    const player = createPlayer()
    player.occupationPlayed = [STUB_BONUS_CHOICES_CARD]
    const state = createState(player)
    requireActiveCardRegistry('bonus-choices-matrix').registerListener(stubBonusChoicesListener)

    const cost = resolveCardCostForTest(
      state, player, 'improvement-any', 'Major_TestChoices', { clay: 2, stone: 2 },
    ) as ComplexCost
    const solutions = computePaymentOptionsForTest(player, cost)
    // optional: true. Paths: skip {clay:2, stone:2}, ChA {clay:0, stone:2, wood:1},
    // ChB {clay:2, stone:0, wood:1}. All 3 are Pareto-incomparable (skip uses 0 wood
    // vs 1 for choices; choices save 2 resources but spend 1 wood).
    expect(solutions.length).toBe(3)
  })

  it('Path B BonusModifier.choices expands via activeModifiers', () => {
    const player = createPlayer()
    player.activeModifiers = [stubBonusChoiceModifier]

    const cost: ComplexCost = { fee: { clay: 2, stone: 2 } }
    const solutions = computePaymentOptionsForTest(player, cost, 'construct')
    // optional: true. Paths: skip {clay:2, stone:2, wood:0},
    // ChA {clay:0, stone:2, wood:1}, ChB {clay:2, stone:0, wood:1}.
    // All 3 are Pareto-incomparable (skip spends 0 wood; choices save 2 of
    // clay/stone but spend 1 wood).
    expect(solutions.length).toBe(3)
    const paidSets = solutions.map((s) => ({
      clay: s.resourcesPaid.clay ?? 0,
      stone: s.resourcesPaid.stone ?? 0,
      wood: s.resourcesPaid.wood ?? 0,
    }))
    expect(paidSets).toContainEqual({ clay: 0, stone: 2, wood: 1 })
    expect(paidSets).toContainEqual({ clay: 2, stone: 0, wood: 1 })
  })

  it('Path-B trade modifier stays inactive when resolver invoked without costType', () => {
    // A Path-B trade modifier keyed on costType='construct' must not leak into
    // a Path-A resolver call that omits costType.
    const player = createPlayer()
    player.occupationPlayed = [STUB_BONUS_CHOICES_CARD]
    player.activeModifiers = [{
      type: 'trade',
      cardId: 'Test_Trade',
      appliesTo: ['construct'],
      from: { food: 1 },
      to: { reed: 1 },
      max: 1,
    }]
    const state = createState(player)
    requireActiveCardRegistry('bonus-choices-matrix').registerListener(stubBonusChoicesListener)

    const cost = resolveCardCostForTest(
      state, player, 'improvement-any', 'Major_TestChoices', { clay: 2, stone: 2 },
    ) as ComplexCost
    // resolveCardCostWithModifiers never reads costType, so Path-B modifiers
    // should not appear in the resolved cost.
    expect(cost.trades).toBeUndefined()
    // And computeAllBuyableCombinations called WITHOUT costType must not pull
    // in Path-B modifiers either. Only the Path-A bonus.choices expansion applies.
    const solutions = computePaymentOptionsForTest(player, cost)
    expect(solutions.length).toBe(3)
    // No solution should have used the Path-B food->reed trade.
    const anyUsedFoodReedTrade = solutions.some((s) =>
      s.tradesUsed?.some((t) => t.trade.from?.food !== undefined && t.trade.to?.reed !== undefined),
    )
    expect(anyUsedFoodReedTrade).toBe(false)
  })

  it('Path-B trade modifier activates when computeAllBuyableCombinations receives costType', () => {
    // Same modifier + player state, but now invoke computeAllBuyableCombinations
    // with costType='construct'. The trade should be included in payment space.
    const player = createPlayer()
    player.activeModifiers = [{
      type: 'trade',
      cardId: 'Test_Trade',
      appliesTo: ['construct'],
      from: { food: 1 },
      to: { reed: 1 },
      max: 1,
    }]
    // Cost requires 1 reed, player has 0 reed but 1 food: only the trade path works.
    player.resources.reed = 0
    player.resources.food = 1
    const cost: ComplexCost = { fee: { reed: 1 } }
    const solutions = computePaymentOptionsForTest(player, cost, 'construct')
    expect(solutions.length).toBeGreaterThanOrEqual(1)
    const usedTheTrade = solutions.some((s) =>
      s.tradesUsed?.some((t) => t.trade.from?.food !== undefined && t.trade.to?.reed !== undefined),
    )
    expect(usedTheTrade).toBe(true)
  })
})
