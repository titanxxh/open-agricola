import { describe, it, expect, beforeEach } from 'vitest'
import {
  payResources,
  applyCostOverride,
  canPayResources,
  keepOnlyOptimals,
  computeAllBuyableCombinations,
  canPayCost,
  executePaymentSolution,
  getCheapestSolution,
  clearPaymentCache,
} from '../../payment/internal'
import { returnCardToBoard } from '../../../cards/helpers/return-card'
import { buildPaymentChoiceResult, payTypedFlatCost } from '../../payment/internal'
import { payAction } from '../pay'

beforeEach(() => {
  clearPaymentCache()
})
import type {
  ActionMutationContext,
  ActionSpace,
  GameState,
  PlayerState,
  Resource,
  ComplexCost,
  PaymentSolution,
  Trade,
  TradeModifier,
} from '../../../contract/types'
import type { DraftGameEvent, EventSink } from '../../../contract/events'
import { A28_ForestSchool } from '../../../cards/A/A28_ForestSchool'
import { A88_HedgeKeeper } from '../../../cards/A/A88_HedgeKeeper'
import { readCardResourceStats } from '../../../cards/helpers/card-state'

const hedgeKeeperModifier = A88_HedgeKeeper.impl.modifiers![0] as TradeModifier

const createMockPlayer = (resources: Partial<Resource>): PlayerState => ({
  id: 'p1',
  name: 'Player 1',
  color: 'red',
  resources: { wood: 0, clay: 0, reed: 0, stone: 0, food: 0, grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0, ...resources },
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
  occupationPlayed: [],houseAnimalType: null,
  houseAnimalCount: 0,
  stableAnimals: {},
  pastures: [],
  fenceSegments: [],
  majorEffects: { wellRounds: 0 },
  startPlayer: false, activeModifiers: [], cardStates: {},
})

const makeEventSink = (capturedEvents: DraftGameEvent[]): EventSink => ({
  emit: (event) => {
    capturedEvents.push(event)
  },
  emitMany: (events) => {
    capturedEvents.push(...events)
  },
})

describe('payResources (legacy)', () => {
  it('deducts resources from player', () => {
    const player = createMockPlayer({ wood: 5, clay: 3 })
    payResources(player, { wood: 2, clay: 1 })
    expect(player.resources.wood).toBe(3)
    expect(player.resources.clay).toBe(2)
  })

  it('ignores zero or negative costs', () => {
    const player = createMockPlayer({ wood: 5 })
    payResources(player, { wood: 0 })
    expect(player.resources.wood).toBe(5)
  })

  it('handles partial cost objects', () => {
    const player = createMockPlayer({ wood: 5, clay: 3 })
    payResources(player, { wood: 2 })
    expect(player.resources.wood).toBe(3)
    expect(player.resources.clay).toBe(3)
  })
})

describe('applyCostOverride', () => {
  it('returns base when no override provided', () => {
    const base = { wood: 3, clay: 2 }
    expect(applyCostOverride(base)).toEqual(base)
  })

  it('adds override values to base', () => {
    const base = { wood: 3 }
    const override = { clay: 2 }
    expect(applyCostOverride(base, override)).toEqual({ wood: 3, clay: 2 })
  })

  it('applies negative overrides (discounts)', () => {
    const base = { wood: 5, clay: 3 }
    const override = { wood: -2 }
    expect(applyCostOverride(base, override)).toEqual({ wood: 3, clay: 3 })
  })

  it('clamps to zero minimum', () => {
    const base = { wood: 2 }
    const override = { wood: -5 }
    expect(applyCostOverride(base, override)).toEqual({ wood: 0 })
  })
})

describe('canPayResources (legacy)', () => {
  it('returns true when player has enough resources', () => {
    const player = createMockPlayer({ wood: 5 })
    expect(canPayResources(player, { wood: 3 })).toBe(true)
  })

  it('returns true when cost is zero or negative', () => {
    const player = createMockPlayer({ wood: 0 })
    expect(canPayResources(player, { wood: 0 })).toBe(true)
  })

  it('returns false when player lacks resources', () => {
    const player = createMockPlayer({ wood: 2 })
    expect(canPayResources(player, { wood: 3 })).toBe(false)
  })

  it('handles multiple resource types', () => {
    const player = createMockPlayer({ wood: 3, clay: 2 })
    expect(canPayResources(player, { wood: 2, clay: 2 })).toBe(true)
    expect(canPayResources(player, { wood: 2, clay: 3 })).toBe(false)
  })
})

describe('keepOnlyOptimals', () => {
  it('returns empty array as-is', () => {
    expect(keepOnlyOptimals([])).toEqual([])
  })

  it('returns single solution as-is', () => {
    const solutions: PaymentSolution[] = [
      { resourcesPaid: { wood: 2 }, tradesUsed: [] },
    ]
    expect(keepOnlyOptimals(solutions)).toEqual(solutions)
  })

  it('keeps dominated solutions', () => {
    const solutions: PaymentSolution[] = [
      { resourcesPaid: { wood: 5 }, tradesUsed: [] },
      { resourcesPaid: { wood: 3 }, tradesUsed: [] },
      { resourcesPaid: { wood: 4 }, tradesUsed: [] },
    ]
    const optimal = keepOnlyOptimals(solutions)
    expect(optimal).toEqual(solutions)
  })

  it('keeps solutions that are optimal in different resources', () => {
    const solutions: PaymentSolution[] = [
      { resourcesPaid: { wood: 2, clay: 5 }, tradesUsed: [] },
      { resourcesPaid: { wood: 5, clay: 2 }, tradesUsed: [] },
    ]
    const optimal = keepOnlyOptimals(solutions)
    expect(optimal).toHaveLength(2)
  })

  it('keeps solution dominated in all dimensions', () => {
    const solutions: PaymentSolution[] = [
      { resourcesPaid: { wood: 3, clay: 3 }, tradesUsed: [] },
      { resourcesPaid: { wood: 2, clay: 2 }, tradesUsed: [] },
      { resourcesPaid: { wood: 4, clay: 4 }, tradesUsed: [] },
    ]
    const optimal = keepOnlyOptimals(solutions)
    expect(optimal).toEqual(solutions)
  })

  it('handles equal solutions', () => {
    const solutions: PaymentSolution[] = [
      { resourcesPaid: { wood: 3 }, tradesUsed: [] },
      { resourcesPaid: { wood: 3 }, tradesUsed: [] },
    ]
    const optimal = keepOnlyOptimals(solutions)
    expect(optimal.length).toBeGreaterThanOrEqual(1)
  })
})

describe('computeAllBuyableCombinations', () => {
  it('returns empty array when cannot afford fee', () => {
    const player = createMockPlayer({ wood: 1 })
    const cost: ComplexCost = { fee: { wood: 3 } }
    expect(computeAllBuyableCombinations(player, cost)).toEqual([])
  })

  it('returns solution when can afford exact fee', () => {
    const player = createMockPlayer({ wood: 3 })
    const cost: ComplexCost = { fee: { wood: 3 } }
    const solutions = computeAllBuyableCombinations(player, cost)
    expect(solutions.length).toBeGreaterThan(0)
    expect(solutions[0].resourcesPaid.wood).toBe(3)
  })

  it('returns solution when player has more than needed', () => {
    const player = createMockPlayer({ wood: 5 })
    const cost: ComplexCost = { fee: { wood: 3 } }
    const solutions = computeAllBuyableCombinations(player, cost)
    expect(solutions.length).toBeGreaterThan(0)
    expect(solutions[0].resourcesPaid.wood).toBe(3)
  })

  it('handles fees array (choose one)', () => {
    const player = createMockPlayer({ wood: 2 })
    const cost: ComplexCost = {
      fees: [
        { wood: 2 },
        { clay: 2 },
      ],
    }
    const solutions = computeAllBuyableCombinations(player, cost)
    expect(solutions.length).toBeGreaterThan(0)
    expect(solutions[0].resourcesPaid.wood).toBe(2)
  })

  it('uses trades to convert resources before payment', () => {
    const player = createMockPlayer({ wood: 4, food: 0 })
    const trade: Trade = { from: { wood: 2 }, to: { food: 3 } }
    const cost: ComplexCost = {
      fee: { food: 3 },
      trades: [trade],
    }
    const solutions = computeAllBuyableCombinations(player, cost)
    expect(solutions.length).toBeGreaterThan(0)
  })

  it('applies bonus discounts', () => {
    const player = createMockPlayer({ wood: 3 })
    const cost: ComplexCost = {
      fee: { wood: 5 },
      bonuses: [{ discount: { wood: 2 } }],
    }
    const solutions = computeAllBuyableCombinations(player, cost)
    expect(solutions.length).toBeGreaterThan(0)
    expect(solutions[0].resourcesPaid.wood).toBe(3)
  })

  it('stacks multiple non-optional bonuses (accumulates discounts)', () => {
    const player = createMockPlayer({ wood: 3 })
    const cost: ComplexCost = {
      fee: { wood: 5 },
      bonuses: [
        { discount: { wood: 1 }, optional: false, sources: ['BonusA'] },
        { discount: { wood: 1 }, optional: false, sources: ['BonusB'] },
      ],
    }
    const solutions = computeAllBuyableCombinations(player, cost)
    expect(solutions.length).toBe(1)
    expect(solutions[0]!.resourcesPaid.wood).toBe(3)  // 5 - 1 - 1 = 3
  })

  it('expands optional bonuses into use-or-skip paths', () => {
    const player = createMockPlayer({ wood: 5 })
    const cost: ComplexCost = {
      fee: { wood: 5 },
      bonuses: [
        { discount: { wood: 2 }, optional: true, sources: ['OptBonus'] },
      ],
    }
    const solutions = computeAllBuyableCombinations(player, cost)
    expect(solutions.map((s) => s.resourcesPaid.wood).sort()).toEqual([3, 5])
  })

  it('combines optional and mandatory bonuses', () => {
    const player = createMockPlayer({ wood: 5 })
    const cost: ComplexCost = {
      fee: { wood: 5 },
      bonuses: [
        { discount: { wood: 1 }, optional: false, sources: ['MustA'] },
        { discount: { wood: 2 }, optional: true, sources: ['OptB'] },
      ],
    }
    const solutions = computeAllBuyableCombinations(player, cost)
    expect(solutions.map((s) => s.resourcesPaid.wood).sort()).toEqual([2, 4])
  })

  it('expands bonus.choices into alternative paths (optional: false = must pick one)', () => {
    const player = createMockPlayer({ wood: 5, clay: 5, stone: 5 })
    const cost: ComplexCost = {
      fee: { clay: 2, stone: 2 },
      bonuses: [
        {
          choices: [
            { discount: { wood: -1, clay: 2 }, sources: ['ChA'] },
            { discount: { wood: -1, stone: 2 }, sources: ['ChB'] },
          ],
          optional: false,
          sources: ['BonusChoice'],
        },
      ],
    }
    const solutions = computeAllBuyableCombinations(player, cost)
    // Two Pareto-incomparable solutions survive.
    expect(solutions.length).toBe(2)
    const paid = solutions.map((s) => ({
      clay: s.resourcesPaid.clay ?? 0,
      stone: s.resourcesPaid.stone ?? 0,
      wood: s.resourcesPaid.wood ?? 0,
    }))
    expect(paid).toContainEqual({ clay: 0, stone: 2, wood: 1 })
    expect(paid).toContainEqual({ clay: 2, stone: 0, wood: 1 })
  })

  it('expands bonus.choices with optional: true (adds skip path)', () => {
    const player = createMockPlayer({ wood: 5, clay: 5, stone: 5 })
    const cost: ComplexCost = {
      fee: { clay: 2, stone: 2 },
      bonuses: [
        {
          choices: [
            { discount: { wood: -1, clay: 2 }, sources: ['ChA'] },
            { discount: { wood: -1, stone: 2 }, sources: ['ChB'] },
          ],
          optional: true,
          sources: ['BonusChoice'],
        },
      ],
    }
    const solutions = computeAllBuyableCombinations(player, cost)
    // Skip path pays {clay:2, stone:2} (0 wood). Each choice pays 3 total but
    // spends 1 wood. Under Pareto dominance (skip uses less wood), skip is
    // NOT dominated by either choice — all 3 paths survive.
    expect(solutions.length).toBe(3)
    const paid = solutions.map((s) => ({
      clay: s.resourcesPaid.clay ?? 0,
      stone: s.resourcesPaid.stone ?? 0,
      wood: s.resourcesPaid.wood ?? 0,
    }))
    expect(paid).toContainEqual({ clay: 2, stone: 2, wood: 0 })
    expect(paid).toContainEqual({ clay: 0, stone: 2, wood: 1 })
    expect(paid).toContainEqual({ clay: 2, stone: 0, wood: 1 })
  })

  it('throws when bonus has both discount and choices', () => {
    const player = createMockPlayer({ wood: 5 })
    const cost: ComplexCost = {
      fee: { wood: 1 },
      bonuses: [
        {
          discount: { wood: 1 },
          choices: [{ discount: { wood: 1 } }],
        },
      ],
    }
    expect(() => computeAllBuyableCombinations(player, cost)).toThrow(
      /Bonus must have exactly one of discount or choices/,
    )
  })

  it('throws when bonus has neither discount nor choices', () => {
    const player = createMockPlayer({ wood: 5 })
    const cost: ComplexCost = {
      fee: { wood: 1 },
      bonuses: [{} as any],
    }
    expect(() => computeAllBuyableCombinations(player, cost)).toThrow(
      /Bonus must have exactly one of discount or choices/,
    )
  })

  it('applies BonusModifier.choices via activeModifiers path', () => {
    const player = createMockPlayer({ wood: 5, clay: 5, stone: 5 })
    player.activeModifiers = [
      {
        type: 'bonus',
        cardId: 'Test_FrameBuilder',
        appliesTo: ['construct'],
        optional: true,
        choices: [
          { discount: { wood: -1, clay: 2 } },
          { discount: { wood: -1, stone: 2 } },
        ],
      },
    ]
    const cost: ComplexCost = { fee: { clay: 2, stone: 2 } }
    const solutions = computeAllBuyableCombinations(player, cost, undefined, 'construct')
    expect(solutions.length).toBeGreaterThanOrEqual(2)
    const hasClaySave = solutions.some(
      (s) => (s.resourcesPaid.clay ?? 0) === 0 && (s.resourcesPaid.wood ?? 0) === 1,
    )
    const hasStoneSave = solutions.some(
      (s) => (s.resourcesPaid.stone ?? 0) === 0 && (s.resourcesPaid.wood ?? 0) === 1,
    )
    expect(hasClaySave).toBe(true)
    expect(hasStoneSave).toBe(true)
  })

  it('A88 HedgeKeeper: BGA-style empty-from trade covers up to 3 wood of fencing fee', () => {
    const player = createMockPlayer({ wood: 1 })
    player.activeModifiers = [{ ...hedgeKeeperModifier }]
    const cost: ComplexCost = { fee: { wood: 4 } }
    const solutions = computeAllBuyableCombinations(player, cost, undefined, 'fencing')
    expect(solutions.length).toBeGreaterThan(0)
    const best = solutions[0]!
    expect(best.resourcesPaid.wood).toBe(1)
    const hk = best.tradesUsed.find(
      (u) => u.trade.sourceId === 'A88_HedgeKeeper' && u.times === 3,
    )
    expect(hk).toBeDefined()
  })

  it('keeps typed flat direct payment aligned with trade combinations for A88 HedgeKeeper', () => {
    const player = createMockPlayer({ wood: 10 })
    player.activeModifiers = [{ ...hedgeKeeperModifier }]

    const solutions = computeAllBuyableCombinations(
      player,
      { fee: { wood: 6 } },
      undefined,
      'fencing',
    )
    expect(solutions.length).toBeGreaterThan(0)
    expect(solutions[0]?.resourcesPaid.wood).toBe(3)

    expect(payTypedFlatCost(player, { wood: 6 }, 'fencing')).toBe(true)
    expect(player.resources.wood).toBe(7)
  })

  it('handles multiple trades', () => {
    const player = createMockPlayer({ wood: 4, clay: 2 })
    const trades: Trade[] = [
      { from: { wood: 2 }, to: { food: 1 } },
      { from: { clay: 1 }, to: { reed: 1 } },
    ]
    const cost: ComplexCost = {
      fee: { food: 1, reed: 1 },
      trades,
    }
    const solutions = computeAllBuyableCombinations(player, cost)
    expect(solutions.length).toBeGreaterThan(0)
  })

  it('filters overproduced negative-resource solutions for typed modifier costs', () => {
    const player = createMockPlayer({ clay: 2, stone: 2 })
    player.activeModifiers = [
      {
        type: 'trade',
        cardId: 'Test_Stable_Clay',
        appliesTo: ['stables'],
        from: { clay: 2 },
        to: { wood: 2 },
        max: 1,
      },
      {
        type: 'trade',
        cardId: 'Test_Stable_Stone',
        appliesTo: ['stables'],
        from: { stone: 2 },
        to: { wood: 2 },
        max: 1,
      },
    ]

    const solutions = computeAllBuyableCombinations(player, { fee: { wood: 2 } }, undefined, 'stables')

    expect(solutions).toHaveLength(2)
    expect(
      solutions.every((solution) =>
        Object.values(solution.resourcesPaid).every((value) => (value ?? 0) >= 0),
      ),
    ).toBe(true)
    expect(solutions.map((solution) => solution.resourcesPaid)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ clay: 2, stone: 0, wood: 0 }),
        expect.objectContaining({ clay: 0, stone: 2, wood: 0 }),
      ]),
    )
  })

  it('handles empty cost (free)', () => {
    const player = createMockPlayer({ wood: 5 })
    const cost: ComplexCost = {}
    const solutions = computeAllBuyableCombinations(player, cost)
    expect(solutions.length).toBeGreaterThan(0)
    expect(solutions[0].resourcesPaid.wood ?? 0).toBe(0)
  })

  it('filters to optimal solutions only', () => {
    const player = createMockPlayer({ wood: 10 })
    const trade: Trade = { from: { wood: 2 }, to: { food: 1 }, max: 3 }
    const cost: ComplexCost = {
      fee: { food: 1 },
      trades: [trade],
    }
    const solutions = computeAllBuyableCombinations(player, cost)
    expect(solutions.length).toBeLessThanOrEqual(4)
  })
})

describe('canPayCost', () => {
  it('handles simple Resource cost (backward compatible)', () => {
    const player = createMockPlayer({ wood: 5 })
    expect(canPayCost(player, { wood: 3 })).toBe(true)
    expect(canPayCost(player, { wood: 6 })).toBe(false)
  })

  it('handles ComplexCost with fee', () => {
    const player = createMockPlayer({ wood: 5 })
    const cost: ComplexCost = { fee: { wood: 3 } }
    expect(canPayCost(player, cost)).toBe(true)
  })

  it('handles ComplexCost with trades', () => {
    const player = createMockPlayer({ wood: 4 })
    const trade: Trade = { from: { wood: 2 }, to: { food: 3 } }
    const cost: ComplexCost = { fee: { food: 3 }, trades: [trade] }
    expect(canPayCost(player, cost)).toBe(true)
  })

  it('returns false for unaffordable ComplexCost', () => {
    const player = createMockPlayer({ wood: 1 })
    const cost: ComplexCost = { fee: { wood: 3 } }
    expect(canPayCost(player, cost)).toBe(false)
  })
})

describe('executePaymentSolution', () => {
  it('deducts resources from player', () => {
    const player = createMockPlayer({ wood: 5, clay: 3 })
    const solution: PaymentSolution = {
      resourcesPaid: { wood: 2, clay: 1 },
      tradesUsed: [],
    }
    executePaymentSolution(player, solution)
    expect(player.resources.wood).toBe(3)
    expect(player.resources.clay).toBe(2)
  })

  it('handles empty payment', () => {
    const player = createMockPlayer({ wood: 5 })
    const solution: PaymentSolution = {
      resourcesPaid: {},
      tradesUsed: [],
    }
    executePaymentSolution(player, solution)
    expect(player.resources.wood).toBe(5)
  })
})

describe('payment choice ordering', () => {
  it('uses stable resource display order in payment labels', () => {
    const result = buildPaymentChoiceResult([
      { resourcesPaid: { stone: 1, wood: 2, reed: 1 }, tradesUsed: [] },
    ], 'pay:test')

    expect(result.type).toBe('request')
    if (result.type !== 'request') return
    expect(result.request.kind).toBe('choice')
    if (result.request.kind !== 'choice') return
    expect(result.request.options[0]?.labelKey).toBe('prompt.selectPaymentOption')
    expect(result.request.options[0]?.labelParams).toEqual({
      resourcesPaid: { stone: 1, wood: 2, reed: 1 },
      cardUsed: undefined,
    })
    expect((result.request.options[0] as any)?.effectPreview).toEqual({
      kind: 'payment',
      resourcesPaid: { stone: 1, wood: 2, reed: 1 },
      cardUsed: undefined,
    })
  })

  it('sorts same-cost returned-card solutions deterministically', () => {
    const result = buildPaymentChoiceResult([
      { resourcesPaid: { clay: 2 }, tradesUsed: [], cardUsed: 'Major_StoneOven' },
      { resourcesPaid: { clay: 2 }, tradesUsed: [], cardUsed: 'Major_ClayOven' },
    ], 'pay:test', true)

    expect(result.type).toBe('request')
    if (result.type !== 'request') return
    expect(result.request.kind).toBe('choice')
    if (result.request.kind !== 'choice') return
    expect(result.request.options.map((option) => option.labelParams)).toMatchObject([
      { resourcesPaid: { clay: 2 }, cardUsed: 'Major_ClayOven' },
      { resourcesPaid: { clay: 2 }, cardUsed: 'Major_StoneOven' },
    ])
    expect(result.request.options.map((option) => (option as any).effectPreview)).toEqual([
      {
        kind: 'payment',
        resourcesPaid: { clay: 2 },
        cardUsed: 'Major_ClayOven',
      },
      {
        kind: 'payment',
        resourcesPaid: { clay: 2 },
        cardUsed: 'Major_StoneOven',
      },
    ])
  })

  it('merges extra payment sources into labels and effect previews', () => {
    const result = buildPaymentChoiceResult([
      { resourcesPaid: { wood: 1 }, tradesUsed: [], feeIndex: 0 },
      { resourcesPaid: { food: 1 }, tradesUsed: [], feeIndex: 1 },
    ], 'pay:test', false, {
      extraSourcesForSolution: (solution) =>
        solution.feeIndex === 1 ? ['HookCandidate'] : [],
    })

    expect(result.type).toBe('request')
    if (result.type !== 'request') return
    expect(result.request.kind).toBe('choice')
    if (result.request.kind !== 'choice') return
    const sourced = result.request.options.find((option) =>
      Array.isArray(option.labelParams.sourceCards),
    )
    expect(sourced?.labelParams).toMatchObject({
      resourcesPaid: { food: 1 },
      sourceCards: ['HookCandidate'],
    })
    expect(sourced?.effectPreview).toMatchObject({
      resourcesPaid: { food: 1 },
      sourceCards: ['HookCandidate'],
    })
  })
})

describe('getCheapestSolution', () => {
  it('returns undefined for empty array', () => {
    expect(getCheapestSolution([])).toBeUndefined()
  })

  it('returns single solution', () => {
    const solutions: PaymentSolution[] = [
      { resourcesPaid: { wood: 3 }, tradesUsed: [] },
    ]
    expect(getCheapestSolution(solutions)).toBe(solutions[0])
  })

  it('returns solution with minimum total resources', () => {
    const solutions: PaymentSolution[] = [
      { resourcesPaid: { wood: 5, clay: 2 }, tradesUsed: [] },
      { resourcesPaid: { wood: 2, clay: 1 }, tradesUsed: [] },
      { resourcesPaid: { wood: 3, clay: 3 }, tradesUsed: [] },
    ]
    const cheapest = getCheapestSolution(solutions)
    expect(cheapest?.resourcesPaid.wood).toBe(2)
    expect(cheapest?.resourcesPaid.clay).toBe(1)
  })

  it('handles solutions with different resource types', () => {
    const solutions: PaymentSolution[] = [
      { resourcesPaid: { wood: 10 }, tradesUsed: [] },
      { resourcesPaid: { clay: 2 }, tradesUsed: [] },
    ]
    const cheapest = getCheapestSolution(solutions)
    expect(cheapest?.resourcesPaid.clay).toBe(2)
  })
})

describe('Integration: Complex payment scenarios', () => {
  it('handles bakery scenario: grain to food', () => {
    const player = createMockPlayer({ grain: 3, food: 0 })
    const trade: Trade = { from: { grain: 1 }, to: { food: 2 }, max: 2 }
    const cost: ComplexCost = { fee: { food: 3 }, trades: [trade] }
    const solutions = computeAllBuyableCombinations(player, cost)
    expect(solutions.length).toBeGreaterThan(0)
    expect(canPayCost(player, cost)).toBe(true)
  })

  it('handles fireplace scenario: animal to food', () => {
    const player = createMockPlayer({ sheep: 2, food: 0 })
    const trade: Trade = { from: { sheep: 1 }, to: { food: 2 } }
    const cost: ComplexCost = { fee: { food: 2 }, trades: [trade] }
    expect(canPayCost(player, cost)).toBe(true)
  })

  it('handles multiple fees choice', () => {
    const player = createMockPlayer({ wood: 2, clay: 0 })
    const cost: ComplexCost = {
      fees: [
        { wood: 2 },
        { clay: 2 },
        { stone: 1 },
      ],
    }
    expect(canPayCost(player, cost)).toBe(true)
  })

  it('handles renovation cost with material trade', () => {
    const player = createMockPlayer({ wood: 4, reed: 1 })
    const cost: ComplexCost = {
      fee: { reed: 1 },
      fees: [{ wood: 2 }, { clay: 2 }],
    }
    const solutions = computeAllBuyableCombinations(player, cost)
    expect(solutions.length).toBeGreaterThan(0)
    expect(solutions.some(s => s.resourcesPaid.wood === 2)).toBe(true)
  })
})

describe('Card-based payment', () => {
  it('generates card payment solution when player has required card', () => {
    const player = createMockPlayer({ clay: 0 })
    player.improvements = ['Major_Fireplace1']
    const cost: ComplexCost = {
      fee: { clay: 4 },
      cards: { type: 'Major', list: ['Major_Fireplace1', 'Major_Fireplace2'] },
    }
    const solutions = computeAllBuyableCombinations(player, cost, player.improvements)
    expect(solutions.some(s => s.cardUsed === 'Major_Fireplace1')).toBe(true)
  })

  it('does not generate card solution when player lacks required card', () => {
    const player = createMockPlayer({ clay: 2 })
    player.improvements = []
    const cost: ComplexCost = {
      fee: { clay: 4 },
      cards: { type: 'Major', list: ['Major_Fireplace1', 'Major_Fireplace2'] },
    }
    const solutions = computeAllBuyableCombinations(player, cost, player.improvements)
    expect(solutions.every(s => !s.cardUsed)).toBe(true)
  })

  it('returns cardUsed from executePaymentSolution', () => {
    const player = createMockPlayer({ clay: 2 })
    player.improvements = ['Major_Fireplace1']
    const solution: PaymentSolution = {
      resourcesPaid: { clay: 2 },
      tradesUsed: [],
      cardUsed: 'Major_Fireplace1',
    }
    const cardUsed = executePaymentSolution(player, solution)
    expect(cardUsed).toBe('Major_Fireplace1')
    expect(player.resources.clay).toBe(0)
  })

  it('combines required returned card with resource payment', () => {
    const player = createMockPlayer({ clay: 2 })
    player.improvements = ['Major_ClayOven']
    const cost: ComplexCost = {
      fee: { clay: 2 },
      cards: {
        type: 'Major',
        list: ['Major_ClayOven', 'Major_StoneOven'],
        required: true,
      },
    }

    const solutions = computeAllBuyableCombinations(player, cost, player.improvements)

    expect(solutions).toHaveLength(1)
    expect(solutions[0]).toMatchObject({
      resourcesPaid: { clay: 2 },
      tradesUsed: [],
      cardUsed: 'Major_ClayOven',
    })
  })

  it('keeps separate required-card solutions when multiple returned cards match', () => {
    const player = createMockPlayer({ clay: 2 })
    player.improvements = ['Major_ClayOven', 'Major_StoneOven']
    const cost: ComplexCost = {
      fee: { clay: 2 },
      cards: {
        type: 'Major',
        list: ['Major_ClayOven', 'Major_StoneOven'],
        required: true,
      },
    }

    const solutions = computeAllBuyableCombinations(player, cost, player.improvements)

    expect(solutions).toHaveLength(2)
    expect(solutions.map((solution) => solution.cardUsed).sort()).toEqual([
      'Major_ClayOven',
      'Major_StoneOven',
    ])
    expect(solutions.every((solution) => (solution.resourcesPaid.clay ?? 0) === 2)).toBe(true)
  })

  it('fails required-card payment when matching card is missing', () => {
    const player = createMockPlayer({ clay: 2 })
    player.improvements = []
    const cost: ComplexCost = {
      fee: { clay: 2 },
      cards: {
        type: 'Major',
        list: ['Major_ClayOven', 'Major_StoneOven'],
        required: true,
      },
    }

    const solutions = computeAllBuyableCombinations(player, cost, player.improvements)
    expect(solutions).toEqual([])
  })
})

describe('returnCardToBoard', () => {
  it('removes card from improvements', () => {
    const player = createMockPlayer({})
    player.improvements = ['Major_Fireplace1', 'Major_Joinery']
    returnCardToBoard(player, 'Major_Fireplace1')
    expect(player.improvements).toEqual(['Major_Joinery'])
  })

  it('removes card from minorPlayed', () => {
    const player = createMockPlayer({})
    player.minorPlayed = ['A3_PaperKnife', 'B75_WoodWorkshop']
    returnCardToBoard(player, 'A3_PaperKnife')
    expect(player.minorPlayed).toEqual(['B75_WoodWorkshop'])
  })

  it('handles non-existent card gracefully', () => {
    const player = createMockPlayer({})
    player.improvements = ['Major_Fireplace1']
    returnCardToBoard(player, 'Major_NonExistent')
    expect(player.improvements).toEqual(['Major_Fireplace1'])
  })

  it('returns removed major improvement to the board when state is provided', () => {
    const player = createMockPlayer({})
    player.improvements = ['Major_Fireplace1', 'Major_Joinery']
    const state = {
      availableMajorImprovements: ['Major_Pottery'],
    } as unknown as GameState

    returnCardToBoard(player, 'Major_Fireplace1', state)

    expect(player.improvements).toEqual(['Major_Joinery'])
    expect(state.availableMajorImprovements).toEqual([
      'Major_Pottery',
      'Major_Fireplace1',
    ])
  })

  it('does not duplicate returned majors already on the board', () => {
    const player = createMockPlayer({})
    player.improvements = ['Major_Fireplace1']
    const state = {
      availableMajorImprovements: ['Major_Fireplace1'],
    } as unknown as GameState

    returnCardToBoard(player, 'Major_Fireplace1', state)

    expect(player.improvements).toEqual([])
    expect(state.availableMajorImprovements).toEqual(['Major_Fireplace1'])
  })
})

describe('Integration: Cooking Hearth upgrade scenario', () => {
  it('can pay clay cost without Fireplace', () => {
    const player = createMockPlayer({ clay: 4 })
    player.improvements = []
    const cost: ComplexCost = {
      fee: { clay: 4 },
      cards: { type: 'Major', list: ['Major_Fireplace1', 'Major_Fireplace2'] },
    }
    const solutions = computeAllBuyableCombinations(player, cost, player.improvements)
    expect(solutions.length).toBeGreaterThan(0)
    expect(solutions.some(s => !s.cardUsed)).toBe(true)
  })

  it('can upgrade from Fireplace for free (return card, no extra cost)', () => {
    const player = createMockPlayer({ clay: 0 })
    player.improvements = ['Major_Fireplace1']
    const cost: ComplexCost = {
      fee: { clay: 4 },
      cards: { type: 'Major', list: ['Major_Fireplace1', 'Major_Fireplace2'] },
    }
    const solutions = computeAllBuyableCombinations(player, cost, player.improvements)
    expect(solutions.some(s => s.cardUsed === 'Major_Fireplace1')).toBe(true)
    // Card return costs no resources
    const cardSol = solutions.find(s => s.cardUsed === 'Major_Fireplace1')!
    const totalPaid = Object.values(cardSol.resourcesPaid).reduce((sum, v) => sum + (v ?? 0), 0)
    expect(totalPaid).toBe(0)
  })

  it('offers both payment options when player has clay and Fireplace', () => {
    const player = createMockPlayer({ clay: 4 })
    player.improvements = ['Major_Fireplace1']
    const cost: ComplexCost = {
      fee: { clay: 4 },
      cards: { type: 'Major', list: ['Major_Fireplace1', 'Major_Fireplace2'] },
    }
    const solutions = computeAllBuyableCombinations(player, cost, player.improvements)
    // Should have both: pay 4 clay OR return Fireplace
    expect(solutions.some(s => !s.cardUsed && (s.resourcesPaid.clay ?? 0) === 4)).toBe(true)
    expect(solutions.some(s => s.cardUsed === 'Major_Fireplace1')).toBe(true)
    expect(solutions.length).toBeGreaterThanOrEqual(2)
  })

  it('generates resource-only solutions when player lacks required card', () => {
    const player = createMockPlayer({ clay: 2 })
    player.improvements = []
    const cost: ComplexCost = {
      fee: { clay: 4 },
      cards: { type: 'Major', list: ['Major_Fireplace1', 'Major_Fireplace2'] },
    }
    const solutions = computeAllBuyableCombinations(player, cost, player.improvements)
    const cardSolutions = solutions.filter(s => s.cardUsed)
    expect(cardSolutions).toHaveLength(0)
  })
})

const callPay = (
  player: PlayerState,
  params: Record<string, unknown>,
  extra: Partial<{ sourceCard: string; actionContext: Record<string, unknown>; state: GameState }> = {},
) => {
  const capturedEvents: DraftGameEvent[] = []
  const result = payAction.execute({
    state: extra.state ?? { players: [player] } as GameState,
    player,
    space: { id: 'test', name: '', actionId: 'pay', round: 0 } as unknown as ActionSpace,
    params,
    sourceCard: extra.sourceCard,
    actionContext: extra.actionContext,
    eventSink: makeEventSink(capturedEvents),
  } as ActionMutationContext)
  return { result, capturedEvents }
}

const callPayResolveChoice = (
  player: PlayerState,
  params: Record<string, unknown>,
  choice: string,
  extra: Partial<{ sourceCard: string; state: GameState }> = {},
) => {
  const capturedEvents: DraftGameEvent[] = []
  const result = payAction.resolveChoice?.({
    state: extra.state ?? { players: [player] } as GameState,
    player,
    space: { id: 'test', name: '', actionId: 'pay', round: 0 } as unknown as ActionSpace,
    params,
    sourceCard: extra.sourceCard,
    eventSink: makeEventSink(capturedEvents),
  } as ActionMutationContext, choice)
  return { result, capturedEvents }
}

describe('payAction', () => {
  it('exists with id "pay"', () => {
    expect(payAction.id).toBe('pay')
  })

  it('simple Partial<Resource>: pays from resources, returns ok', () => {
    const player = createMockPlayer({ wood: 3 })
    const { result } = callPay(player, { cost: { wood: 2 } })
    expect(result.type).toBe('ok')
    expect(player.resources.wood).toBe(1)
    if (result.type === 'ok') {
      expect(result.resourcesPaid).toEqual({ wood: 2 })
    }
  })

  it('simple Partial<Resource> insufficient: returns fail', () => {
    const player = createMockPlayer({ wood: 1 })
    const { result } = callPay(player, { cost: { wood: 2 } })
    expect(result.type).toBe('fail')
    expect(player.resources.wood).toBe(1)
  })

  it('missing cost params: returns fail', () => {
    const player = createMockPlayer({ wood: 5 })
    const { result } = callPay(player, {})
    expect(result.type).toBe('fail')
  })

  it('simple Partial<Resource>: emits resource.paid with payment source', () => {
    const player = createMockPlayer({ wood: 3 })
    const { result, capturedEvents } = callPay(player, { cost: { wood: 2 } })
    expect(result.type).toBe('ok')
    expect(capturedEvents).toEqual([
      {
        type: 'resource.paid',
        resources: { wood: 2 },
        to: { kind: 'supply' },
        paymentFor: 'cardEffect',
        paymentSources: [
          { from: { kind: 'player', playerId: 'p1' }, resources: { wood: 2 } },
        ],
      },
    ])
  })

  it('does not attribute typed action payments to the source card by default', () => {
    const player = createMockPlayer({ wood: 3 })
    const { result } = callPay(
      player,
      { cost: { wood: 2 }, costType: 'construct' },
      { sourceCard: 'A128_RiparianBuilder' },
    )

    expect(result.type).toBe('ok')
    expect(readCardResourceStats(player, 'A128_RiparianBuilder')).toBeUndefined()
  })

  it('honors explicit source-card payment stat tracking for card-effect payments', () => {
    const disabledPlayer = createMockPlayer({ food: 3 })
    const disabled = callPay(
      disabledPlayer,
      { cost: { food: 1 }, trackSourceCardPaymentStats: false },
      { sourceCard: 'B82_ValueAssets' },
    )

    expect(disabled.result.type).toBe('ok')
    expect(readCardResourceStats(disabledPlayer, 'B82_ValueAssets')).toBeUndefined()

    const enabledPlayer = createMockPlayer({ food: 3 })
    const enabled = callPay(
      enabledPlayer,
      { cost: { food: 1 }, trackSourceCardPaymentStats: true },
      { sourceCard: 'B82_ValueAssets' },
    )

    expect(enabled.result.type).toBe('ok')
    expect(readCardResourceStats(enabledPlayer, 'B82_ValueAssets')?.paid).toEqual({ food: 1 })
  })

  it('records selected card-purchase candidate attribution without source-card PAID stats', () => {
    const player = createMockPlayer({ wood: 3, food: 1 })
    const cost: ComplexCost = {
      fees: [
        { wood: 3 },
        { wood: 1, food: 1 },
      ],
    }
    const { result } = callPay(
      player,
      {
        cost,
        costType: 'minor-improvement',
        paymentChoice: '0',
        candidateMetadataByFeeIndex: {
          0: { originalFeeIndex: 0, sources: [] },
          1: {
            originalFeeIndex: 0,
            sources: ['D117_WoodExpert'],
            costAttribution: {
              D117_WoodExpert: {
                saved: { wood: 2 },
                paid: { food: 1 },
              },
            },
          },
        },
      },
      { sourceCard: 'D20_TurnwrestPlow' },
    )

    expect(result.type).toBe('ok')
    expect(readCardResourceStats(player, 'D117_WoodExpert')).toMatchObject({
      saved: { wood: 2 },
      paid: { food: 1 },
    })
    expect(readCardResourceStats(player, 'D20_TurnwrestPlow')).toBeUndefined()
  })
})

describe('payAction: ComplexCost typed-flat single solution', () => {
  it('typed-flat: pays single solution and decrements resources', () => {
    const player = createMockPlayer({ wood: 5 })
    const cost: ComplexCost = { fee: { wood: 2 } }
    const { result } = callPay(player, { cost, costType: 'construct' })
    expect(result.type).toBe('ok')
    expect(player.resources.wood).toBe(3)
  })

  it('typed-flat insufficient: returns fail and does not mutate', () => {
    const player = createMockPlayer({ wood: 1 })
    const cost: ComplexCost = { fee: { wood: 3 } }
    const { result } = callPay(player, { cost })
    expect(result.type).toBe('fail')
    expect(player.resources.wood).toBe(1)
  })

  it('typed-flat: emits resource.paid with cost type', () => {
    const player = createMockPlayer({ wood: 5 })
    const cost: ComplexCost = { fee: { wood: 2 } }
    const { result, capturedEvents } = callPay(player, { cost, costType: 'construct' })
    expect(result.type).toBe('ok')
    expect(capturedEvents).toEqual([
      expect.objectContaining({
        type: 'resource.paid',
        resources: { wood: 2 },
        paymentFor: 'construct',
        paymentSources: [
          { from: { kind: 'player', playerId: 'p1' }, resources: { wood: 2 } },
        ],
      }),
    ])
  })

  it('typed-flat Partial<Resource>: event keeps bonusChoiceIndex provenance', () => {
    const player = createMockPlayer({ wood: 1, clay: 2 })
    player.activeModifiers = [
      {
        type: 'bonus',
        cardId: 'TestBonusCard',
        appliesTo: ['construct'],
        optional: false,
        choices: [
          { discount: { wood: 1 } },
          { discount: { clay: 1 } },
        ],
      },
    ]
    const { result, capturedEvents } = callPay(player, {
      cost: { wood: 2, clay: 2 },
      costType: 'construct',
    })

    expect(result.type).toBe('ok')
    expect(capturedEvents).toEqual([
      expect.objectContaining({
        type: 'resource.paid',
        resources: { wood: 1, clay: 2 },
        paymentFor: 'construct',
        bonusSources: ['TestBonusCard'],
        bonusChoiceIndex: { TestBonusCard: 0 },
      }),
    ])
  })

  it('typed-flat Partial<Resource> with reserve applies selected multi-solution payment', () => {
    const player = createMockPlayer({ food: 3, wood: 1 })
    player.activeModifiers = [A28_ForestSchool.impl.modifiers![0] as TradeModifier]
    const params = {
      cost: { food: 1 },
      costType: 'occupation',
      optionPrefix: 'pay:reserve-test',
      reserveResources: { food: 2 },
    }

    const { result: initial } = callPay(player, params)
    expect(initial.type).toBe('request')
    if (initial.type !== 'request') throw new Error('expected request')
    if (initial.request.kind !== 'choice') throw new Error('expected choice kind')
    const woodOption = initial.request.options.find((option) => {
      const paid = (
        (option.labelParams as { resourcesPaid?: Record<string, number> } | undefined)
          ?.resourcesPaid ?? {}
      )
      return paid.wood === 1
    })
    expect(woodOption).toBeDefined()

    const { result } = callPayResolveChoice(player, params, woodOption!.value)
    expect(result?.type).toBe('ok')
    expect(player.resources.food).toBe(3)
    expect(player.resources.wood).toBe(0)
  })

})

describe('payAction: ComplexCost multi-solution choice', () => {
  it('emits choice when multiple solutions exist', () => {
    const player = createMockPlayer({ food: 2, grain: 1 })
    const cost: ComplexCost = { fees: [{ food: 2 }, { grain: 1 }] }
    const { result } = callPay(player, { cost, optionPrefix: 'pay:test' })
    expect(result.type).toBe('request')
    if (result.type !== 'request') return
    expect(result.request.kind).toBe('choice')
    if (result.request.kind !== 'choice') return
    expect(result.request.options.length).toBe(2)
    expect(result.request.options.every((o) => o.value.startsWith('pay:test:'))).toBe(true)
  })

  it('resolveChoice / paymentChoice param applies selected solution', () => {
    const player = createMockPlayer({ food: 2, grain: 1 })
    const cost: ComplexCost = { fees: [{ food: 2 }, { grain: 1 }] }
    const { result: initial } = callPay(player, { cost, optionPrefix: 'pay:test' })
    if (initial.type !== 'request') throw new Error('expected request')
    if (initial.request.kind !== 'choice') throw new Error('expected choice kind')
    const grainOption = initial.request.options.find(
      (o) =>
        ((o.labelParams as { resourcesPaid?: Record<string, number> } | undefined)
          ?.resourcesPaid?.grain ?? 0) === 1,
    )
    expect(grainOption).toBeDefined()
    const { result } = callPay(player, {
      cost,
      optionPrefix: 'pay:test',
      paymentChoice: grainOption!.value,
    })
    expect(result.type).toBe('ok')
    expect(player.resources.grain).toBe(0)
    expect(player.resources.food).toBe(2)
  })

  it('multi-choice bonus: extraData.bonusChoiceIndex carries chosen index', () => {
    const player = createMockPlayer({ wood: 3, clay: 3 })
    const cost: ComplexCost = {
      fee: { wood: 2, clay: 2 },
      bonuses: [
        {
          sources: ['TestBonusCard'],
          choices: [
            // discount applies as fee minus discount, so positive 1 = save 1
            { discount: { wood: 1 } },
            { discount: { clay: 1 } },
          ],
          optional: false,
        },
      ],
    }
    const { result: initial } = callPay(player, { cost, optionPrefix: 'pay:bonus' })
    expect(initial.type).toBe('request')
    if (initial.type !== 'request') throw new Error('expected request')
    if (initial.request.kind !== 'choice') throw new Error('expected choice kind')
    // pick the option that saves wood (paid 1 wood + 2 clay)
    const woodSaveOption = initial.request.options.find((o) => {
      const paid = (
        (o.labelParams as { resourcesPaid?: Record<string, number> } | undefined)
          ?.resourcesPaid ?? {}
      ) as Record<string, number>
      return paid.wood === 1 && paid.clay === 2
    })
    expect(woodSaveOption).toBeDefined()
    const { result, capturedEvents } = callPay(player, {
      cost,
      optionPrefix: 'pay:bonus',
      paymentChoice: woodSaveOption!.value,
    })
    expect(result.type).toBe('ok')
    if (result.type === 'ok') {
      const extra = result.extraData as
        | { bonusChoiceIndex?: Record<string, number>; bonusUsed?: string[] }
        | undefined
      expect(extra?.bonusChoiceIndex?.['TestBonusCard']).toBe(0)
      expect(extra?.bonusUsed).toContain('TestBonusCard')
    }
    expect(capturedEvents).toEqual([
      expect.objectContaining({
        type: 'resource.paid',
        resources: { wood: 1, clay: 2 },
        paymentFor: 'cardEffect',
        bonusSources: ['TestBonusCard'],
        bonusChoiceIndex: { TestBonusCard: 0 },
      }),
    ])
  })

  it('required returned card payment: event keeps returnedCardId provenance', () => {
    const player = createMockPlayer({ clay: 2 })
    player.improvements = ['Major_ClayOven']
    const state = { players: [player], availableMajorImprovements: [] } as unknown as GameState
    const cost: ComplexCost = {
      fee: { clay: 2 },
      cards: {
        type: 'Major',
        list: ['Major_ClayOven'],
        required: true,
      },
    }
    const { result, capturedEvents } = callPay(
      player,
      { cost, includeReturnedCard: true, playedCards: player.improvements },
      { state },
    )
    expect(result.type).toBe('ok')
    expect(capturedEvents).toEqual([
      expect.objectContaining({
        type: 'resource.paid',
        resources: { clay: 2 },
        returnedCardId: 'Major_ClayOven',
      }),
    ])
  })
})
