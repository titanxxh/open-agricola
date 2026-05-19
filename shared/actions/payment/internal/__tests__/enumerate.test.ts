import { describe, expect, it } from 'vitest'
import { computeAllBuyableCombinations } from '../enumerate'
import type { PaymentSolution, PlayerState, Resource } from '../../../../contract/types'

const nonZeroPaid = (sol: PaymentSolution): Partial<Resource> => {
  const out: Partial<Resource> = {}
  for (const [k, v] of Object.entries(sol.resourcesPaid)) {
    if ((v ?? 0) !== 0) out[k as keyof Resource] = v
  }
  return out
}

const baseTestPlayer = (overrides: Partial<Resource> = {}): PlayerState => ({
  id: 'p1', name: 'P1', color: 'red',
  resources: {
    wood: 0, clay: 0, reed: 0, stone: 0, food: 0, grain: 0, vegetable: 0,
    sheep: 0, boar: 0, cattle: 0, begging: 0, ...overrides,
  },
  workers: [], rooms: 1, houseType: 'wood', fields: [], roomTiles: [], stableTiles: [],
  improvements: [], minorHand: [], minorPlayed: [], occupationHand: [], occupationPlayed: [],
  extraOccupationsFromCards: [], playedCards: [],
  houseAnimalType: null, houseAnimalCount: 0, stableAnimals: {}, pastures: [], fenceSegments: [],
  majorEffects: { wellRounds: 0 }, startPlayer: false, activeModifiers: [], cardStates: {},
  stats: {} as never,
})

describe('computeAllBuyableCombinations — nb + unitFee scaling', () => {
  it('total fee = fees + nb x unitFee', () => {
    const sols = computeAllBuyableCombinations(
      baseTestPlayer({ reed: 6, wood: 15 }),
      { fees: [{}], unitFee: { reed: 2, wood: 5 }, nb: 3 },
    )
    expect(sols.length).toBeGreaterThan(0)
    expect(nonZeroPaid(sols[0])).toEqual({ reed: 6, wood: 15 })
  })

  it('scope:unit trade is bounded by sigma-times <= nb', () => {
    const sols = computeAllBuyableCombinations(
      baseTestPlayer({ wood: 4, clay: 9, reed: 6 }),
      {
        fees: [{}], unitFee: { reed: 2, clay: 5 }, nb: 3,
        trades: [{ from: { wood: 1 }, to: { clay: 2 }, scope: 'unit' }],
      },
    )
    const swapCounts = sols.map((s) => s.tradesUsed.find((t) => t.trade.from.wood)?.times ?? 0)
    expect(Math.max(...swapCounts)).toBeLessThanOrEqual(3)
  })

  it('scope:action trade with max=3 NOT bounded by nb', () => {
    const sols = computeAllBuyableCombinations(
      baseTestPlayer({ wood: 2 }),
      {
        fee: { wood: 5 },
        trades: [{ from: {}, to: { wood: 1 }, max: 3, scope: 'action' }],
      },
    )
    expect(nonZeroPaid(sols[0])).toEqual({ wood: 2 })
  })

  it('nb absent → unit-trade rejected by validateComplexCost (dev mode)', () => {
    expect(() => computeAllBuyableCombinations(
      baseTestPlayer(),
      { fee: { wood: 5 }, trades: [{ from: { wood: 1 }, to: { reed: 1 }, scope: 'unit' }] },
    )).toThrow(/nb.*missing/)
  })

  it('bonus with minNumRooms:2 — applied when nb=2, skipped when nb=1', () => {
    const player = baseTestPlayer({ reed: 4, wood: 10 })
    const cost = (nb: number) => ({
      fees: [{}], unitFee: { reed: 2, wood: 5 }, nb,
      bonuses: [{ discount: { reed: 2 }, optional: false, conditions: { minNumRooms: 2 } }],
    })
    const sols1 = computeAllBuyableCombinations(player, cost(1))
    const sols2 = computeAllBuyableCombinations(player, cost(2))
    // nb=1: no discount, fee = 2 reed + 5 wood; player has 4 reed + 10 wood → pays 2 reed + 5 wood
    expect(sols1[0]?.resourcesPaid.reed).toBe(2)
    // nb=2: with discount, fee = (4-2) reed + 10 wood = 2 reed + 10 wood
    expect(sols2[0]?.resourcesPaid.reed).toBe(2)
    expect(sols2[0]?.resourcesPaid.wood).toBe(10)
  })
})
