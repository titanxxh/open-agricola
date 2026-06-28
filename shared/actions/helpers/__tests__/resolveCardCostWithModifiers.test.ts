import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { getRegisteredCardListeners, type CardListenerRegistration } from '../../../cards/card-listeners'
import {
  discountCardCostCandidate,
  resolveCardCostWithModifiers,
  resolveCardCostWithModifiersDetailed,
} from '../../payment/internal'
import type { CardCostCandidateMetadata, ComplexCost as ComplexCostType, PaymentResourceMap } from '../../../contract/types'

// Closure output order is traversal-defined; assert fees+metadata as a set.
const candidateRows = (
  cost: ComplexCostType,
  metadata: Record<number, CardCostCandidateMetadata> | undefined,
) =>
  (cost.fees ?? []).map((resources: PaymentResourceMap, index: number) => ({
    resources,
    ...(metadata ? { meta: metadata[index] } : {}),
  }))

const sortedRows = (rows: ReturnType<typeof candidateRows>) =>
  [...rows].sort((a, b) => {
    const ka = JSON.stringify(a)
    const kb = JSON.stringify(b)
    return ka < kb ? -1 : ka > kb ? 1 : 0
  })

const expectRowsEqual = (
  actual: ReturnType<typeof candidateRows>,
  expected: ReturnType<typeof candidateRows>,
) => {
  expect(sortedRows(actual)).toEqual(sortedRows(expected))
}
import type { GameState, PlayerState, ComplexCost } from '../../../contract/types'
import { CardRegistry } from '../../../../shared/cards/registry'
import { setActiveCardRegistry, requireActiveCardRegistry } from '../../../../shared/cards/active-registry'

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
      state, player, 'improvement', 'Major_Basket', { reed: 2, stone: 2 },
    )
    expect(result).toEqual({ reed: 2, stone: 2 })
  })

  it('accumulates multiple costs deltas (order-independent)', () => {
    const player = createPlayer()
    player.occupationPlayed = ['HookA', 'HookB']
    const state = createState(player)

    requireActiveCardRegistry('resolveCardCostWithModifiers').registerListener({
      id: 'hook-a', cardIds: ['HookA'], phases: ['computeCosts'],
      actions: ['improvement'],
      handler: () => ({ costs: { stone: -1 } }),
    })
    requireActiveCardRegistry('resolveCardCostWithModifiers').registerListener({
      id: 'hook-b', cardIds: ['HookB'], phases: ['computeCosts'],
      actions: ['improvement'],
      handler: () => ({ costs: { reed: -1 } }),
    })

    const result = resolveCardCostWithModifiers(
      state, player, 'improvement', 'Major_Basket', { reed: 2, stone: 2 },
    )
    expect(result).toEqual({ reed: 1, stone: 1 })
  })

  it('pushes trades returned by hooks into ComplexCost.trades', () => {
    const player = createPlayer()
    player.occupationPlayed = ['HookTrade']
    const state = createState(player)

    requireActiveCardRegistry('resolveCardCostWithModifiers').registerListener({
      id: 'hook-trade', cardIds: ['HookTrade'], phases: ['computeCosts'],
      actions: ['improvement'],
      handler: () => ({ trades: [{ from: { wood: 1 }, to: { clay: 2 }, max: 1 }] }),
    })

    const result = resolveCardCostWithModifiers(
      state, player, 'improvement', 'Major_Test', { clay: 2 },
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
      actions: ['improvement'],
      handler: () => ({ bonuses: [{ discount: { stone: 1 }, sources: ['HookBonus'] }] }),
    })

    const result = resolveCardCostWithModifiers(
      state, player, 'improvement', 'Major_Test', { stone: 2 },
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
      actions: ['improvement'],
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
      state, player, 'improvement', 'Major_Test', { clay: 2, stone: 2 },
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
      actions: ['improvement'],
      handler: () => ({
        costs: { reed: -1 },
        trades: [{ from: { wood: 1 }, to: { clay: 1 } }],
        bonuses: [{ discount: { stone: 1 } }],
      }),
    })

    const result = resolveCardCostWithModifiers(
      state, player, 'improvement', 'Major_Test', { reed: 2, clay: 1, stone: 1 },
    ) as ComplexCost
    expect(result.fee).toEqual({ reed: 1, clay: 1, stone: 1 })
    expect(result.trades).toHaveLength(1)
    expect(result.bonuses).toHaveLength(1)
  })

  it('derives card-purchase candidates from each base fee with source metadata', () => {
    const player = createPlayer()
    player.occupationPlayed = ['HookA', 'HookB']
    const state = createState(player)

    requireActiveCardRegistry('resolveCardCostWithModifiers').registerListener({
      id: 'hook-a', cardIds: ['HookA'], phases: ['computeCosts'],
      actions: ['improvement'],
      handler: () => undefined,
      deriveCardCostCandidate: (_context, candidate) =>
        discountCardCostCandidate(candidate, 'HookA', { wood: 2 }),
    })
    requireActiveCardRegistry('resolveCardCostWithModifiers').registerListener({
      id: 'hook-b', cardIds: ['HookB'], phases: ['computeCosts'],
      actions: ['improvement'],
      handler: () => undefined,
      deriveCardCostCandidate: (_context, candidate) =>
        candidate.sources.includes('HookA') && !candidate.sources.includes('HookB')
          ? {
              ...candidate,
              resources: {
                ...candidate.resources,
                clay: (candidate.resources.clay ?? 0) + 1,
              },
              sources: [...candidate.sources, 'HookB'],
            }
          : null,
    })

    const result = resolveCardCostWithModifiersDetailed(
      state,
      player,
      'improvement',
      'Major_Test',
      { fees: [{ wood: 1 }, { clay: 2 }, { wood: 3 }] },
    )
    const cost = result.cost as ComplexCost
    expectRowsEqual(candidateRows(cost, result.candidateMetadataByFeeIndex), [
      { resources: { wood: 1 }, meta: { originalFeeIndex: 0, sources: [] } },
      { resources: { clay: 2 }, meta: { originalFeeIndex: 1, sources: [] } },
      { resources: { wood: 3 }, meta: { originalFeeIndex: 2, sources: [] } },
      {
        resources: {},
        meta: {
          originalFeeIndex: 0,
          sources: ['HookA'],
          costAttribution: { HookA: { saved: { wood: 1 } } },
        },
      },
      {
        resources: { wood: 1 },
        meta: {
          originalFeeIndex: 2,
          sources: ['HookA'],
          costAttribution: { HookA: { saved: { wood: 2 } } },
        },
      },
      {
        resources: { clay: 1 },
        meta: {
          originalFeeIndex: 0,
          sources: ['HookA', 'HookB'],
          costAttribution: { HookA: { saved: { wood: 1 } } },
        },
      },
      {
        resources: { wood: 1, clay: 1 },
        meta: {
          originalFeeIndex: 2,
          sources: ['HookA', 'HookB'],
          costAttribution: { HookA: { saved: { wood: 2 } } },
        },
      },
    ])
  })

  it('keeps one representative row when identical resource candidates differ only by sources', () => {
    const player = createPlayer()
    player.occupationPlayed = ['HookA', 'HookB']
    const state = createState(player)

    for (const id of ['HookA', 'HookB']) {
      requireActiveCardRegistry('resolveCardCostWithModifiers').registerListener({
        id: `hook-${id}`, cardIds: [id], phases: ['computeCosts'],
        actions: ['improvement'],
        handler: () => undefined,
        deriveCardCostCandidate: (_context, candidate) =>
          candidate.sources.length === 0
            ? discountCardCostCandidate(candidate, id, { wood: 1 })
            : null,
      })
    }

    const result = resolveCardCostWithModifiersDetailed(
      state,
      player,
      'improvement',
      'Major_Test',
      { wood: 1 },
    )
    const cost = result.cost as ComplexCost
    // ADR 0004 amendment: equivalent rows (same resources + originalFeeIndex)
    // collapse to one deterministic representative — the player never sees
    // duplicate payment options that differ only by attribution.
    expectRowsEqual(candidateRows(cost, result.candidateMetadataByFeeIndex), [
      { resources: { wood: 1 }, meta: { originalFeeIndex: 0, sources: [] } },
      {
        resources: {},
        meta: {
          originalFeeIndex: 0,
          sources: ['HookA'],
          costAttribution: { HookA: { saved: { wood: 1 } } },
        },
      },
    ])
  })
  it('records actual saved attribution on discounted card-purchase candidates', () => {
    const player = createPlayer()
    player.occupationPlayed = ['HookDiscount']
    const state = createState(player)

    requireActiveCardRegistry('resolveCardCostWithModifiers').registerListener({
      id: 'hook-discount', cardIds: ['HookDiscount'], phases: ['computeCosts'],
      actions: ['improvement'],
      handler: () => undefined,
      deriveCardCostCandidate: (_context, candidate) =>
        discountCardCostCandidate(candidate, 'HookDiscount', { wood: 2 }),
    })

    const result = resolveCardCostWithModifiersDetailed(
      state,
      player,
      'improvement',
      'Major_Test',
      { fees: [{ wood: 1 }, { wood: 3 }, { clay: 2 }] },
    )
    const cost = result.cost as ComplexCost
    expectRowsEqual(candidateRows(cost, result.candidateMetadataByFeeIndex), [
      { resources: { wood: 1 }, meta: { originalFeeIndex: 0, sources: [] } },
      { resources: { wood: 3 }, meta: { originalFeeIndex: 1, sources: [] } },
      { resources: { clay: 2 }, meta: { originalFeeIndex: 2, sources: [] } },
      {
        resources: {},
        meta: {
          originalFeeIndex: 0,
          sources: ['HookDiscount'],
          costAttribution: { HookDiscount: { saved: { wood: 1 } } },
        },
      },
      {
        resources: { wood: 1 },
        meta: {
          originalFeeIndex: 1,
          sources: ['HookDiscount'],
          costAttribution: { HookDiscount: { saved: { wood: 2 } } },
        },
      },
    ])
  })

  it('keeps bonus-producing card-purchase hooks on the existing bonus path', () => {
    const player = createPlayer()
    player.occupationPlayed = ['HookCandidates', 'HookBonus']
    const state = createState(player)

    requireActiveCardRegistry('resolveCardCostWithModifiers').registerListener({
      id: 'hook-candidates', cardIds: ['HookCandidates'], phases: ['computeCosts'],
      actions: ['improvement'],
      handler: () => undefined,
      deriveCardCostCandidate: (_context, candidate) =>
        discountCardCostCandidate(candidate, 'HookCandidates', { stone: 1 }),
    })
    requireActiveCardRegistry('resolveCardCostWithModifiers').registerListener({
      id: 'hook-bonus', cardIds: ['HookBonus'], phases: ['computeCosts'],
      actions: ['improvement'],
      handler: () => ({
        bonuses: [{ discount: { reed: 1 }, sources: ['HookBonus'] }],
      }),
    })

    const result = resolveCardCostWithModifiersDetailed(
      state,
      player,
      'improvement',
      'Major_Test',
      { reed: 2, stone: 1 },
    )
    const cost = result.cost as ComplexCost
    expectRowsEqual(candidateRows(cost, undefined), [
      { resources: { reed: 2, stone: 1 } },
      { resources: { reed: 2 } },
    ])
    expect(cost.bonuses).toEqual([
      { discount: { reed: 1 }, sources: ['HookBonus'] },
    ])
  })
})
