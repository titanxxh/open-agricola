import { describe, expect, it } from 'vitest'
import { canPayCost, computeAllBuyableCombinations } from '../enumerate'
import type { ComplexCost, PaymentSolution, PlayerState, Resource, Trade } from '../../../../contract/types'

const nonZeroPaid = (sol: PaymentSolution): Partial<Resource> => {
  const out: Partial<Resource> = {}
  for (const [k, v] of Object.entries(sol.resourcesPaid)) {
    if ((v ?? 0) !== 0) out[k as keyof Resource] = v
  }
  return out
}

const sources = (sol: PaymentSolution): string[] => {
  const out = new Set<string>()
  for (const entry of sol.tradesUsed) {
    if (entry.times <= 0) continue
    const source = entry.trade.sourceId ?? entry.trade.source
    if (source) out.add(source)
  }
  for (const source of sol.bonusUsed?.split(',') ?? []) {
    if (source) out.add(source)
  }
  return [...out].sort()
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

  it('scope:unit trade applies at most once per unit by default', () => {
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

  it('keeps exact free action-trade discounts but rejects surplus-producing trade combos', () => {
    const free = computeAllBuyableCombinations(
      baseTestPlayer({ grain: 1 }),
      {
        fee: { wood: 1 },
        trades: [{ from: {}, to: { wood: 1 }, max: 1, scope: 'action' }],
      },
      undefined,
      'fencing',
    )
    expect(free.map(nonZeroPaid)).toContainEqual({})

    const combo = computeAllBuyableCombinations(
      baseTestPlayer({ clay: 1, grain: 1 }),
      {
        fee: { wood: 1 },
        trades: [{ from: { clay: 1 }, to: { wood: 1 }, max: 1, scope: 'action' }],
        bonuses: [{ discount: { wood: 1, grain: -1 }, optional: true, sources: ['D88_Millwright'] }],
      },
      undefined,
      'fencing',
    )
    expect(combo.some((sol) =>
      Object.values(sol.resourcesPaid).some((amount) => (amount ?? 0) < 0),
    )).toBe(false)
    expect(combo.map(nonZeroPaid)).not.toContainEqual({ wood: -1, clay: 1, grain: 1 })
    expect(combo.map(nonZeroPaid)).toContainEqual({ grain: 1 })
  })

  it('applies bonuses after typed unit cost alternatives', () => {
    const combo = computeAllBuyableCombinations(
      baseTestPlayer({ clay: 1, grain: 1 }),
      {
        fee: { wood: 1 },
        trades: [{ from: { clay: 1 }, to: { wood: 1 }, scope: 'unit', sourceId: 'A16_RammedClay' }],
        bonuses: [{
          choices: [
            { discount: { wood: 1, grain: -1 } },
            { discount: { clay: 1, grain: -1 } },
          ],
          optional: true,
          sources: ['D88_Millwright'],
        }],
      },
      undefined,
      'fencing',
    )

    expect(combo.some((sol) =>
      JSON.stringify(nonZeroPaid(sol)) === JSON.stringify({ grain: 1 }) &&
      JSON.stringify(sources(sol)) === JSON.stringify(['A16_RammedClay', 'D88_Millwright']),
    )).toBe(true)
  })

  it('nb absent → unit-trade rejected by validateComplexCost (dev mode)', () => {
    expect(() => computeAllBuyableCombinations(
      baseTestPlayer(),
      { fee: { wood: 5 }, trades: [{ from: { wood: 1 }, to: { reed: 1 }, scope: 'unit' }] },
    )).toThrow(/nb.*missing/)
  })

  it('independent unit-scope trades can both apply to one cost row', () => {
    const sols = computeAllBuyableCombinations(
      baseTestPlayer({ wood: 1, food: 1 }),
      {
        unitFee: { clay: 2, reed: 2 }, nb: 1,
        trades: [
          { from: { wood: 1 }, to: { clay: 2 }, scope: 'unit' },
          { from: { food: 1 }, to: { reed: 2 }, scope: 'unit' },
        ],
      },
    )
    expect(sols.some((s) => {
      const paid = nonZeroPaid(s)
      return paid.wood === 1 && paid.food === 1 && paid.clay === undefined && paid.reed === undefined
    })).toBe(true)
  })

  it('groupMax caps action-scope alternatives across one payment solution', () => {
    const groupedTrades: Trade[] = [
      { from: { wood: 1 }, to: { food: 2 }, max: 1, groupId: 'g', groupMax: 1 },
      { from: { clay: 1 }, to: { food: 2 }, max: 1, groupId: 'g', groupMax: 1 },
    ]

    const sols = computeAllBuyableCombinations(
      baseTestPlayer({ wood: 1, clay: 1 }),
      { fee: { food: 4 }, trades: groupedTrades },
    )

    expect(sols).toEqual([])
  })

  it('groupMax caps unit-scope alternatives across the total unit cost', () => {
    const groupedTrades: Trade[] = [
      { from: { wood: 1 }, to: { food: 2 }, scope: 'unit', groupId: 'g', groupMax: 1 },
      { from: { clay: 1 }, to: { food: 2 }, scope: 'unit', groupId: 'g', groupMax: 1 },
    ]

    const sols = computeAllBuyableCombinations(
      baseTestPlayer({ wood: 1, clay: 1, food: 2 }),
      { unitFee: { food: 2 }, nb: 2, trades: groupedTrades },
    )

    expect(sols.length).toBeGreaterThan(0)
    for (const sol of sols) {
      const groupedTimes = sol.tradesUsed.reduce((sum, entry) => sum + entry.times, 0)
      expect(groupedTimes).toBeLessThanOrEqual(1)
    }
    expect(sols.some((s) => {
      const paid = nonZeroPaid(s)
      return paid.wood === 1 && paid.clay === 1 && paid.food === undefined
    })).toBe(false)
  })

  it('mixed action + unit trades — independent budgets', () => {
    const sols = computeAllBuyableCombinations(
      baseTestPlayer({ wood: 10 }),
      {
        unitFee: { wood: 3 }, nb: 1,
        trades: [
          { from: {}, to: { wood: 1 }, max: 2, scope: 'action' },
          { from: { wood: 1 }, to: { clay: 1 }, scope: 'unit' },
        ],
      },
    )
    sols.forEach((s) => {
      const actionTimes = s.tradesUsed.find((t) => Object.keys(t.trade.from).length === 0)?.times ?? 0
      const unitTimes = s.tradesUsed.find((t) => t.trade.from.wood)?.times ?? 0
      expect(actionTimes).toBeLessThanOrEqual(2)
      expect(unitTimes).toBeLessThanOrEqual(1)
    })
  })

  it('cache key distinguishes nb (no cross-nb collisions)', () => {
    const player = baseTestPlayer({ reed: 100, wood: 100 })
    const sols1 = computeAllBuyableCombinations(player, { unitFee: { reed: 2, wood: 5 }, nb: 1 })
    const sols2 = computeAllBuyableCombinations(player, { unitFee: { reed: 2, wood: 5 }, nb: 2 })
    expect(sols1[0]?.resourcesPaid).not.toEqual(sols2[0]?.resourcesPaid)
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

  it('optional bonus keeps original and discounted paths', () => {
    const player = baseTestPlayer({ wood: 2, stone: 2 })
    const cost: ComplexCost = {
      fee: { wood: 2, stone: 2 },
      bonuses: [{
        discount: { stone: 1 },
        optional: true,
        sources: ['C27_Blueprint'],
      }],
    }

    const sols = computeAllBuyableCombinations(player, cost)

    expect(sols.some((s) => {
      const paid = nonZeroPaid(s)
      return paid.wood === 2 && paid.stone === 2 && !s.bonusUsed
    })).toBe(true)
    expect(sols.some((s) => {
      const paid = nonZeroPaid(s)
      return paid.wood === 2 && paid.stone === 1 && s.bonusUsed === 'C27_Blueprint'
    })).toBe(true)
  })

  it('non-optional bonus choices prune choices that do not reduce the current cost', () => {
    const player = baseTestPlayer({ wood: 2 })
    const cost: ComplexCost = {
      fee: { wood: 2 },
      bonuses: [{
        optional: false,
        sources: ['TEST_BONUS'],
        choices: [
          { discount: { clay: 1 }, sources: ['TEST_BONUS'] },
          { discount: { wood: 1 }, sources: ['TEST_BONUS'] },
        ],
      }],
    }

    const sols = computeAllBuyableCombinations(player, cost)
    const payments = sols.map(nonZeroPaid)

    expect(payments).toEqual([{ wood: 1 }])
    expect(sols[0]?.bonusUsed).toBe('TEST_BONUS')
  })

  it('non-optional bonus choices fall back to no-op when no choice applies', () => {
    const player = baseTestPlayer({ wood: 2 })
    const cost: ComplexCost = {
      fee: { wood: 2 },
      bonuses: [{
        optional: false,
        sources: ['TEST_BONUS'],
        choices: [
          { discount: { clay: 1 }, sources: ['TEST_BONUS'] },
        ],
      }],
    }

    const sols = computeAllBuyableCombinations(player, cost)

    expect(sols.map(nonZeroPaid)).toEqual([{ wood: 2 }])
    expect(sols[0]?.bonusUsed).toBeUndefined()
  })

  it('top-k bonus choices cannot skip an unusable intermediate resource', () => {
    const player = baseTestPlayer({ clay: 5, reed: 2 })
    const cost: ComplexCost = {
      fee: { clay: 5, reed: 2 },
      bonuses: [{
        optional: true,
        sources: ['E123_ResourceHoarder'],
        choices: [
          { discount: {} },
          { discount: { clay: 1 } },
          { discount: { clay: 1, wood: 1 } },
          { discount: { clay: 1, wood: 1, reed: 1 } },
        ],
      }],
    }

    const sols = computeAllBuyableCombinations(player, cost)
    const payments = sols.map(nonZeroPaid)

    expect(payments).toContainEqual({ clay: 4, reed: 2 })
    expect(payments).not.toContainEqual({ clay: 4, reed: 1 })
  })

  it('replacement bonus choices cannot add replacement cost unless the reduction fully applies', () => {
    const player = baseTestPlayer({ stone: 1, reed: 1, wood: 1 })
    const cost: ComplexCost = {
      fee: { stone: 1, reed: 1 },
      bonuses: [{
        optional: true,
        sources: ['A123_FrameBuilder'],
        choices: [
          { discount: { wood: -1, stone: 2 }, sources: ['A123_FrameBuilder'] },
        ],
      }],
    }

    const sols = computeAllBuyableCombinations(player, cost)
    const payments = sols.map(nonZeroPaid)

    expect(payments).toContainEqual({ reed: 1, stone: 1 })
    expect(payments).not.toContainEqual({ reed: 1, wood: 1 })
  })

  it('capDiscountAtCost removes the current cost for a resource without requiring an exact discount amount', () => {
    const player = baseTestPlayer({ wood: 5, reed: 2 })
    const cost: ComplexCost = {
      fee: { wood: 5, reed: 2 },
      bonuses: [{
        discount: { reed: 99 },
        capDiscountAtCost: true,
        optional: true,
        sources: ['C14_StrawThatchedRoof'],
      }],
    }

    const sols = computeAllBuyableCombinations(player, cost)
    const payments = sols.map(nonZeroPaid)

    expect(payments).toContainEqual({ wood: 5, reed: 2 })
    expect(payments).toContainEqual({ wood: 5 })
  })

  it('B145 renovation can replace 2 reed with 1 wood', () => {
    const player = baseTestPlayer({ stone: 2, food: 2, wood: 1 })
    player.activeModifiers = [{
      type: 'bonus',
      cardId: 'B145_BrushwoodCollector',
      appliesTo: ['renovation'],
      optional: true,
      choices: [
        { discount: { reed: 1, wood: -1 }, sources: ['B145_BrushwoodCollector'], minCost: { reed: 1 }, maxCost: { reed: 1 } },
        { discount: { reed: 2, wood: -1 }, sources: ['B145_BrushwoodCollector'], minCost: { reed: 2 }, maxCost: { reed: 2 } },
      ],
    }]

    const sols = computeAllBuyableCombinations(
      player,
      { fees: [{ reed: 2, food: 2 }], unitFee: { stone: 1 }, nb: 2 },
      undefined,
      'renovation',
    )

    expect(sols.some((s) => {
      const paid = nonZeroPaid(s)
      return paid.stone === 2 && paid.food === 2 && paid.wood === 1 && paid.reed === undefined
    })).toBe(true)
  })

  it('B145 renovation does not replace 3 reed', () => {
    const player = baseTestPlayer({ stone: 3, food: 3, wood: 1, reed: 1 })
    player.activeModifiers = [{
      type: 'bonus',
      cardId: 'B145_BrushwoodCollector',
      appliesTo: ['renovation'],
      optional: true,
      choices: [
        { discount: { reed: 1, wood: -1 }, sources: ['B145_BrushwoodCollector'], minCost: { reed: 1 }, maxCost: { reed: 1 } },
        { discount: { reed: 2, wood: -1 }, sources: ['B145_BrushwoodCollector'], minCost: { reed: 2 }, maxCost: { reed: 2 } },
      ],
    }]

    const sols = computeAllBuyableCombinations(
      player,
      { fees: [{ reed: 3, food: 3 }], unitFee: { stone: 1 }, nb: 3 },
      undefined,
      'renovation',
    )

    expect(sols).toEqual([])
  })
})

describe('canPayCost — costType parameter', () => {
  it('fast path: simple Partial<Resource> + no costType → canPayResources', () => {
    expect(canPayCost(baseTestPlayer({ wood: 5 }), { wood: 5 })).toBe(true)
    expect(canPayCost(baseTestPlayer({ wood: 4 }), { wood: 5 })).toBe(false)
  })
  it('with costType: wraps Partial<Resource> into ComplexCost', () => {
    expect(canPayCost(baseTestPlayer({ wood: 5 }), { wood: 5 }, 'plow')).toBe(true)
  })
  it('with ComplexCost: routes through enumerate', () => {
    expect(canPayCost(
      baseTestPlayer({ wood: 15, reed: 6 }),
      { unitFee: { reed: 2, wood: 5 }, nb: 3 },
    )).toBe(true)
  })
})
