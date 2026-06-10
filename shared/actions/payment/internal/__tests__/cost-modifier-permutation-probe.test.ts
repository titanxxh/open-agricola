/**
 * Permutation-invariance property suite for cost modifiers (ADR 0004).
 *
 * Born as `.fails` probes (#288) proving the numeric `order` workaround was
 * load-bearing; promoted to permanent properties once the candidate closure
 * landed (#290 unit trades, #291 card-purchase pipeline). Every case asserts
 * the same contract: shuffling modifier registration order / listener naming
 * never changes the resulting payment candidate set.
 */
import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import type { Trade } from '../../../../contract/types'
import { computeAllBuyableCombinations } from '../enumerate'
import { resolveCardCostWithModifiersDetailed } from '../preview-cost'
import { discountCardCostCandidate } from '../card-cost-candidates'
import {
  getRegisteredCardListeners,
  type CardListenerRegistration,
} from '../../../../cards/card-listeners'
import { CardRegistry } from '../../../../cards/registry'
import {
  setActiveCardRegistry,
  requireActiveCardRegistry,
} from '../../../../cards/active-registry'
import {
  createProbePlayer,
  createProbeState,
  distinctResults,
  feeResourceSet,
  runPermutations,
  solutionPaidSet,
  type ComplexCost,
} from './permutation-harness'

describe('unit-trade ordering probes (current impl applies trades in array/order sequence)', () => {
  // Synthetic trades mirroring D15_ClaySupports (full row replacement: pay
  // 1 wood instead of 3 clay + 1 reed) and B145_BrushwoodCollector
  // (replaceUpTo: pay 1 wood instead of up to 2 reed). Today these cards
  // need order:10 / order:20 to sequence correctly; the probes drop `order`
  // to model the target authoring experience.
  const rowReplacement: Trade = {
    from: { wood: 1 },
    to: { clay: 3, reed: 1 },
    max: 1,
    scope: 'unit',
  }
  const reedSwap: Trade = {
    from: { wood: 1 },
    to: { reed: 2 },
    max: 1,
    scope: 'unit',
    replaceUpTo: true,
  }

  const computePaidSets = (trades: Trade[]) => {
    const player = createProbePlayer({ wood: 10, clay: 10, reed: 10, stone: 10 })
    const cost: ComplexCost = { unitFee: { clay: 5, reed: 2 }, nb: 1, trades }
    return solutionPaidSet(computeAllBuyableCombinations(player, cost))
  }

  // Ordering hazard this guards: applying reedSwap first strips reed from
  // the base row ({clay:5,reed:2} → {clay:5,wood:1}), so a sequential fold
  // would never let rowReplacement match its `to` requirement on that
  // derived row, losing the cheap combined row {clay:2,wood:2}. The closure
  // reaches both regardless of order.
  it('payment candidate set is invariant under unit-trade permutation (D15+B145 shape)', () => {
    const runs = runPermutations([rowReplacement, reedSwap], computePaidSets)
    expect(distinctResults(runs)).toHaveLength(1)
  })

  it('every order reaches the combined row', () => {
    const combinedRow = JSON.stringify([['clay', 2], ['wood', 2]])
    expect(computePaidSets([rowReplacement, reedSwap])).toContain(combinedRow)
    expect(computePaidSets([reedSwap, rowReplacement])).toContain(combinedRow)
  })

  // Three-trade chain (adds an A123_FrameBuilder-shaped wood→clay swap).
  // Deeper chains compound the misses: every permutation that runs reedSwap
  // before rowReplacement loses the rows derived through both.
  const claySwap: Trade = {
    from: { wood: 1 },
    to: { clay: 2 },
    max: 1,
    scope: 'unit',
  }

  it('payment candidate set is invariant under three unit-trade permutations (D15+B145+A123 shape)', () => {
    const runs = runPermutations([rowReplacement, reedSwap, claySwap], computePaidSets)
    expect(distinctResults(runs)).toHaveLength(1)
  })
})

describe('card-purchase pipeline ordering probes (current impl folds listeners by order desc, then id)', () => {
  let snapshot: CardListenerRegistration[] = []

  beforeEach(() => {
    snapshot = getRegisteredCardListeners()
  })

  afterEach(() => {
    const fresh = new CardRegistry()
    setActiveCardRegistry(fresh)
    snapshot.forEach((listener) => fresh.registerListener(listener))
  })

  type SyntheticCardCostListener = {
    cardId: string
    mandatory?: boolean
    deriveCardCostCandidate: NonNullable<
      CardListenerRegistration['deriveCardCostCandidate']
    >
  }

  // Registers the same synthetic modifiers under permuted listener ids
  // (listener-a, listener-b, ...). Renaming a listener is semantically
  // meaningless, so the resulting candidate set must not change.
  const computeFeeSets = (listeners: SyntheticCardCostListener[]) => {
    // Re-seed a clean registry per run: computeFeeSets is called once per
    // permutation and module-level listener registration would accumulate.
    const fresh = new CardRegistry()
    setActiveCardRegistry(fresh)
    snapshot.forEach((listener) => fresh.registerListener(listener))

    const player = createProbePlayer()
    player.occupationPlayed = listeners.map((listener) => listener.cardId)
    const state = createProbeState(player)
    const registry = requireActiveCardRegistry('permutation-probe')
    listeners.forEach((listener, index) => {
      registry.registerListener({
        id: `probe-listener-${String.fromCharCode(97 + index)}`,
        cardIds: [listener.cardId],
        phases: ['computeCosts'],
        actions: ['improvement'],
        handler: () => undefined,
        ...(listener.mandatory ? { cardCostCandidateMandatory: true } : {}),
        deriveCardCostCandidate: listener.deriveCardCostCandidate,
      })
    })
    const result = resolveCardCostWithModifiersDetailed(
      state, player, 'improvement', 'Major_Test', { clay: 1, stone: 2 },
    )
    const cost = result.cost
    const fees = typeof cost === 'object' && 'fees' in cost && cost.fees
      ? cost.fees
      : [cost as Record<string, number>]
    return feeResourceSet(fees)
  }

  // Mirrors A27_OvenSite-shaped optional fixed price plus A143_Stonecutter
  // (stone discount derived from every candidate). Under the closure the
  // fixed row is always reachable for the discount, whatever the ids.
  const fixedPrice: SyntheticCardCostListener = {
    cardId: 'ProbeFixed',
    deriveCardCostCandidate: (_context, candidate) =>
      candidate.sources.includes('ProbeFixed')
        ? null
        : { resources: { clay: 1, stone: 1 }, originalFeeIndex: candidate.originalFeeIndex, sources: ['ProbeFixed'] },
  }
  const stoneDiscount: SyntheticCardCostListener = {
    cardId: 'ProbeDiscount',
    deriveCardCostCandidate: (_context, candidate) =>
      discountCardCostCandidate(candidate, 'ProbeDiscount', { stone: 1 }),
  }

  it('candidate set is invariant under listener naming permutation (fixed-price + discount shape)', () => {
    const runs = runPermutations([fixedPrice, stoneDiscount], computeFeeSets)
    expect(distinctResults(runs)).toHaveLength(1)
  })

  it('every naming order lets the discount reach the fixed row', () => {
    const discounted = JSON.stringify([['clay', 1]])
    expect(computeFeeSets([fixedPrice, stoneDiscount])).toContain(discounted)
    expect(computeFeeSets([stoneDiscount, fixedPrice])).toContain(discounted)
  })

  // Mirrors D117_WoodExpert: derives new candidates from candidates produced
  // by OTHER cost cards (sources non-empty). The closure makes the derived
  // rows reachable regardless of listener naming.
  const deriveFromDiscounted: SyntheticCardCostListener = {
    cardId: 'ProbeDerive',
    deriveCardCostCandidate: (_context, candidate) =>
      candidate.sources.includes('ProbeDiscount')
        ? {
            ...candidate,
            resources: { ...candidate.resources, clay: (candidate.resources.clay ?? 0) + 1 },
            sources: [...candidate.sources, 'ProbeDerive'],
          }
        : null,
  }

  it('candidate set is invariant under listener naming permutation (derive-from-derived shape)', () => {
    const runs = runPermutations([stoneDiscount, deriveFromDiscounted], computeFeeSets)
    expect(distinctResults(runs)).toHaveLength(1)
  })
})

describe('real-card and bonus-stage permutation properties (#292)', () => {
  let snapshot: CardListenerRegistration[] = []

  beforeEach(() => {
    snapshot = getRegisteredCardListeners()
  })

  afterEach(() => {
    const fresh = new CardRegistry()
    setActiveCardRegistry(fresh)
    snapshot.forEach((listener) => fresh.registerListener(listener))
  })

  // Capped bonuses (E123 ResourceHoarder shape) evaluate in the enumerate
  // stage AFTER all trades — a fixed pipeline stage, not a card ordering.
  // Shuffling both the trades and bonuses arrays must not change the
  // reachable payment set.
  it('payment set is invariant under trade and capped-bonus array permutations', () => {
    const player = createProbePlayer({ wood: 10, clay: 10, reed: 10, stone: 10, food: 10 })
    const trades = [
      { from: { food: 1 }, to: { stone: 1 }, max: 1 },
      { from: { wood: 1 }, to: { clay: 2 }, max: 1 },
    ]
    const bonuses = [
      {
        optional: true,
        capDiscountAtCost: true,
        choices: [
          { discount: { stone: 1 }, capDiscountAtCost: true },
          { discount: { stone: 2 }, capDiscountAtCost: true },
        ],
        sources: ['ProbeHoarder'],
      },
      { discount: { clay: 1 }, optional: false, sources: ['ProbeDiscount'] },
    ]
    const compute = (orderedTrades: typeof trades, orderedBonuses: typeof bonuses) =>
      solutionPaidSet(computeAllBuyableCombinations(player, {
        fee: { clay: 2, stone: 2 },
        trades: orderedTrades,
        bonuses: orderedBonuses,
      }))
    const results = runPermutations(trades, (tradePerm) =>
      runPermutations(bonuses, (bonusPerm) => compute(tradePerm, bonusPerm))
        .map((run) => JSON.stringify(run.result)),
    )
    const flattened = results.flatMap((run) => run.result)
    expect(new Set(flattened).size).toBe(1)
  })
})
