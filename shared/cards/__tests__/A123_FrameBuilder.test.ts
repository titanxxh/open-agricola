import { describe, expect, it, beforeEach } from 'vitest'
import { A123_FrameBuilder } from '../../cards-display/A/A123_FrameBuilder'
import { PaymentSolver } from '../../actions/payment'
import { computeAllBuyableCombinations } from '../../actions/payment/internal'
import type {
  BonusModifier,
  ComplexCost,
  PlayerState,
  Resource,
  TradeModifier,
} from '../../contract/types'

const CARD_ID = 'A123_FrameBuilder'

const createMockPlayer = (
  resources: Partial<Resource>,
  houseType: PlayerState['houseType'] = 'clay',
): PlayerState => ({
  id: 'p1',
  name: 'Player 1',
  color: 'red',
  resources: {
    wood: 0,
    clay: 0,
    reed: 0,
    stone: 0,
    food: 0,
    grain: 0,
    vegetable: 0,
    sheep: 0,
    boar: 0,
    cattle: 0,
    begging: 0,
    ...resources,
  },
  workers: [],
  rooms: 2,
  houseType,
  fields: [],
  roomTiles: [],
  stableTiles: [],
  improvements: [],
  minorHand: [],
  minorPlayed: [],
  occupationHand: [],
  occupationPlayed: [CARD_ID],
  extraOccupationsFromCards: [],
  playedCards: [],
  houseAnimalType: null,
  houseAnimalCount: 0,
  stableAnimals: {},
  pastures: [],
  fenceSegments: [],
  majorEffects: { wellRounds: 0 },
  startPlayer: false,
  activeModifiers: [
    ...((A123_FrameBuilder as unknown as {
      modifiers: PlayerState['activeModifiers']
    }).modifiers ?? []),
  ],
  cardStates: {},
  stats: {} as any,
})

beforeEach(() => {
  PaymentSolver.clearCache()
})

describe('A123_FrameBuilder', () => {
  it('card is registered and modifiers reflect construct-trade + renovation-bonus shape', () => {
    expect(A123_FrameBuilder).toBeDefined()
    expect(A123_FrameBuilder.modifiers).toBeDefined()
    const modifiers = A123_FrameBuilder.modifiers ?? []
    // 2 construct unit-trades (clay-house, stone-house) + 1 renovation bonus
    expect(modifiers.length).toBe(3)

    const construct = modifiers.filter((m) =>
      (m as TradeModifier | BonusModifier).appliesTo.includes('construct'),
    )
    expect(construct).toHaveLength(2)
    construct.forEach((m) => {
      expect(m.type).toBe('trade')
      const tm = m as TradeModifier
      expect(tm.scope).toBe('unit')
      expect(tm.from).toEqual({ wood: 1 })
    })
    // One targets clay-house, the other stone-house — mutually exclusive via
    // conditions so the same construct call never offers both swap shapes.
    const claySwap = construct.find((m) => (m as TradeModifier).to.clay === 2)
    const stoneSwap = construct.find((m) => (m as TradeModifier).to.stone === 2)
    expect((claySwap as TradeModifier).conditions).toEqual({ houseTypeClay: 1 })
    expect((stoneSwap as TradeModifier).conditions).toEqual({ houseTypeStone: 1 })

    const renovation = modifiers.filter((m) =>
      (m as TradeModifier | BonusModifier).appliesTo.includes('renovation'),
    )
    expect(renovation).toHaveLength(1)
    expect(renovation[0]!.type).toBe('bonus')
    const bm = renovation[0]! as BonusModifier
    expect(bm.optional).toBe(true)
    expect(bm.choices).toBeDefined()
    expect(bm.choices!.length).toBe(2)
  })

  it('construct clay house: scope:unit budget bounds k∈{0..nb}', () => {
    // nb=2, baseFee = {clay:10, reed:4}; with 2 wood + 6 clay + 4 reed,
    // only k=2 is affordable (clay:6 + wood:2).
    const player = createMockPlayer({ wood: 2, clay: 6, reed: 4 }, 'clay')
    const cost: ComplexCost = { unitFee: { clay: 5, reed: 2 }, nb: 2 }
    const solutions = computeAllBuyableCombinations(player, cost, undefined, 'construct')
    expect(solutions.length).toBeGreaterThan(0)
    const swapCounts = new Set(
      solutions.map((s) =>
        s.tradesUsed.reduce((acc, t) => acc + t.times, 0),
      ),
    )
    // Affordability filter keeps only k=2 (pays {clay:6, reed:4, wood:2}).
    expect(swapCounts.has(2)).toBe(true)
    // No solution should exceed Σ-times = nb.
    solutions.forEach((s) => {
      const total = s.tradesUsed.reduce((acc, t) => acc + t.times, 0)
      expect(total).toBeLessThanOrEqual(2)
    })
  })

  it('construct stone house: only stone-swap trade applies (clay-swap filtered by condition)', () => {
    const player = createMockPlayer({ wood: 1, stone: 3, reed: 2 }, 'stone')
    const cost: ComplexCost = { unitFee: { stone: 5, reed: 2 }, nb: 1 }
    const solutions = computeAllBuyableCombinations(player, cost, undefined, 'construct')
    expect(solutions.length).toBeGreaterThan(0)
    // Best swap solution: 1 wood replaces 2 stone → pays {stone:3, reed:2, wood:1}.
    const swapped = solutions.some(
      (s) => (s.resourcesPaid.stone ?? 0) === 3 && (s.resourcesPaid.wood ?? 0) === 1,
    )
    expect(swapped).toBe(true)
    // No solution should record a clay-swap (no clay in resourcesPaid).
    solutions.forEach((s) => {
      expect(s.resourcesPaid.clay ?? 0).toBe(0)
    })
  })

  it('construct wood house: A123 trade modifiers filtered out entirely', () => {
    const player = createMockPlayer({ wood: 5, reed: 2 }, 'wood')
    const cost: ComplexCost = { unitFee: { wood: 5, reed: 2 }, nb: 1 }
    const solutions = computeAllBuyableCombinations(player, cost, undefined, 'construct')
    expect(solutions.length).toBeGreaterThan(0)
    // No trade should fire (both conditions houseTypeClay/Stone are false).
    solutions.forEach((s) => {
      const used = s.tradesUsed.reduce((acc, t) => acc + t.times, 0)
      expect(used).toBe(0)
    })
  })

  it('renovation cost offers stone-save as a valid solution (BonusModifier path)', () => {
    const player = createMockPlayer({ wood: 1, stone: 2, reed: 2 }, 'stone')
    const cost: ComplexCost = { fee: { stone: 2, reed: 2 } }
    const solutions = computeAllBuyableCombinations(player, cost, undefined, 'renovation')
    expect(solutions.length).toBeGreaterThan(0)
    // Stone-replace bonus: pay 1 wood instead of 2 stone.
    const swapped = solutions.some(
      (s) => (s.resourcesPaid.stone ?? 0) === 0 && (s.resourcesPaid.wood ?? 0) === 1,
    )
    expect(swapped).toBe(true)
  })
})
