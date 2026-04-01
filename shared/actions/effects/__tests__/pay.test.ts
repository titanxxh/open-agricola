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
  returnCardToBoard,
  clearPaymentCache,
} from '../pay'
import { buildPaymentChoiceResult, payTypedFlatCost } from '../pay-helpers'

beforeEach(() => {
  clearPaymentCache()
})
import type { PlayerState, Resource, ComplexCost, PaymentSolution, Trade } from '../../../game/types'
import { A88_HedgeKeeper } from '../../../cards/A/A88_HedgeKeeper'

const createMockPlayer = (resources: Partial<Resource>): PlayerState => ({
  id: 'p1',
  name: 'Player 1',
  color: 'red',
  resources: { wood: 0, clay: 0, reed: 0, stone: 0, food: 0, grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0, ...resources },
  familySize: 2,
  workersAvailable: 2,
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
  playedCards: [],
  houseAnimalType: null,
  houseAnimalCount: 0,
  stableAnimals: {},
  newbornCount: 0,
  pastures: [],
  fenceSegments: [],
  majorEffects: { wellRounds: 0 },
  startPlayer: false, activeModifiers: [], cardStates: {},
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

  it('removes dominated solutions', () => {
    const solutions: PaymentSolution[] = [
      { resourcesPaid: { wood: 5 }, tradesUsed: [] },
      { resourcesPaid: { wood: 3 }, tradesUsed: [] },
      { resourcesPaid: { wood: 4 }, tradesUsed: [] },
    ]
    const optimal = keepOnlyOptimals(solutions)
    expect(optimal).toHaveLength(1)
    expect(optimal[0].resourcesPaid.wood).toBe(3)
  })

  it('keeps solutions that are optimal in different resources', () => {
    const solutions: PaymentSolution[] = [
      { resourcesPaid: { wood: 2, clay: 5 }, tradesUsed: [] },
      { resourcesPaid: { wood: 5, clay: 2 }, tradesUsed: [] },
    ]
    const optimal = keepOnlyOptimals(solutions)
    expect(optimal).toHaveLength(2)
  })

  it('removes solution dominated in all dimensions', () => {
    const solutions: PaymentSolution[] = [
      { resourcesPaid: { wood: 3, clay: 3 }, tradesUsed: [] },
      { resourcesPaid: { wood: 2, clay: 2 }, tradesUsed: [] },
      { resourcesPaid: { wood: 4, clay: 4 }, tradesUsed: [] },
    ]
    const optimal = keepOnlyOptimals(solutions)
    expect(optimal).toHaveLength(1)
    expect(optimal[0].resourcesPaid).toEqual({ wood: 2, clay: 2 })
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

  it('A88 HedgeKeeper: BGA-style empty-from trade covers up to 3 wood of fencing fee', () => {
    const player = createMockPlayer({ wood: 1 })
    player.activeModifiers = [{ ...(A88_HedgeKeeper as any).modifier }]
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
    player.activeModifiers = [{ ...(A88_HedgeKeeper as any).modifier }]

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

    expect(result.type).toBe('choice')
    if (result.type !== 'choice') return
    expect(result.options[0]?.labelKey).toBe('prompt.selectPaymentOption')
    expect(result.options[0]?.labelParams).toEqual({
      resourcesPaid: { stone: 1, wood: 2, reed: 1 },
      cardUsed: undefined,
    })
  })

  it('sorts same-cost returned-card solutions deterministically', () => {
    const result = buildPaymentChoiceResult([
      { resourcesPaid: { clay: 2 }, tradesUsed: [], cardUsed: 'Major_StoneOven' },
      { resourcesPaid: { clay: 2 }, tradesUsed: [], cardUsed: 'Major_ClayOven' },
    ], 'pay:test', true)

    expect(result.type).toBe('choice')
    if (result.type !== 'choice') return
    expect(result.options.map((option) => option.labelParams)).toMatchObject([
      { resourcesPaid: { clay: 2 }, cardUsed: 'Major_ClayOven' },
      { resourcesPaid: { clay: 2 }, cardUsed: 'Major_StoneOven' },
    ])
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
