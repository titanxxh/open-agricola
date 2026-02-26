import { describe, it, expect } from 'vitest'
import {
  payResources,
  applyCostOverride,
  canPayResources,
  keepOnlyOptimals,
  computeAllBuyableCombinations,
  canPayCost,
  executePaymentSolution,
  getCheapestSolution,
} from '../pay'
import type { PlayerState, Resource, ComplexCost, PaymentSolution, Trade } from '../../../game/types'

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
  startPlayer: false,
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
