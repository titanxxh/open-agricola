import { describe, it, expect, beforeEach } from 'vitest'
import type {
  BonusModifier,
  ComplexCost,
  PlayerState,
  Resource,
} from '../../../game/types'
import {
  applyCostModifiers,
  computeAllBuyableCombinations,
  clearPaymentCache,
} from '../../payment/internal'

beforeEach(() => {
  clearPaymentCache()
})

const createMockPlayer = (overrides: Partial<PlayerState> = {}): PlayerState => ({
  id: 'p1',
  name: 'Player 1',
  color: 'red',
  resources: {
    wood: 10,
    clay: 10,
    reed: 10,
    stone: 10,
    food: 0,
    grain: 0,
    vegetable: 0,
    sheep: 0,
    boar: 0,
    cattle: 0,
    begging: 0,
  } as Resource,
  rooms: 5,
  houseType: 'wood',
  fields: [],
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
  ...overrides,
} as unknown as PlayerState)

describe('Bonus.conditions / BonusChoice.conditions evaluation', () => {
  it('1. bonus.conditions satisfied applies discount', () => {
    const player = createMockPlayer({ rooms: 5, houseType: 'wood' })
    const cost: ComplexCost = {
      fee: { stone: 4 },
      bonuses: [
        {
          discount: { stone: 2 },
          conditions: { houseTypeWood: 1, minNumRooms: 5 },
          optional: false,
        },
      ],
    }
    const sols = computeAllBuyableCombinations(player, cost)
    expect(sols.some((s) => (s.resourcesPaid.stone ?? 0) === 2)).toBe(true)
  })

  it('2. bonus.conditions unsatisfied (rooms<5) skips discount', () => {
    const player = createMockPlayer({ rooms: 4, houseType: 'wood' })
    const cost: ComplexCost = {
      fee: { stone: 4 },
      bonuses: [
        {
          discount: { stone: 2 },
          conditions: { houseTypeWood: 1, minNumRooms: 5 },
          optional: false,
        },
      ],
    }
    const sols = computeAllBuyableCombinations(player, cost)
    expect(sols.length).toBeGreaterThan(0)
    expect(sols.every((s) => (s.resourcesPaid.stone ?? 0) === 4)).toBe(true)
  })

  it('3. bonus.conditions unsatisfied + optional skips bonus path', () => {
    const player = createMockPlayer({ rooms: 4, houseType: 'wood' })
    const cost: ComplexCost = {
      fee: { stone: 4 },
      bonuses: [
        {
          discount: { stone: 2 },
          conditions: { minNumRooms: 5 },
          optional: true,
        },
      ],
    }
    const sols = computeAllBuyableCombinations(player, cost)
    expect(sols.length).toBeGreaterThan(0)
    expect(sols.every((s) => (s.resourcesPaid.stone ?? 0) === 4)).toBe(true)
  })

  it('4. partial BonusChoice.conditions selects only matching choices', () => {
    const player = createMockPlayer({ houseType: 'wood' })
    const cost: ComplexCost = {
      fee: { wood: 2, clay: 2 },
      bonuses: [
        {
          choices: [
            { discount: { wood: 2 }, conditions: { houseTypeWood: 1 } },
            { discount: { clay: 2 }, conditions: { houseTypeStone: 1 } },
          ],
          optional: false,
        },
      ],
    }
    const sols = computeAllBuyableCombinations(player, cost)
    expect(sols.some((s) => (s.resourcesPaid.wood ?? 0) === 0)).toBe(true)
    expect(sols.every((s) => (s.resourcesPaid.clay ?? 0) === 2)).toBe(true)
  })

  it('5. all BonusChoice.conditions unsatisfied skips bonus', () => {
    const player = createMockPlayer({ houseType: 'clay' })
    const cost: ComplexCost = {
      fee: { wood: 2, clay: 2 },
      bonuses: [
        {
          choices: [
            { discount: { wood: 2 }, conditions: { houseTypeWood: 1 } },
            { discount: { clay: 2 }, conditions: { houseTypeStone: 1 } },
          ],
          optional: false,
        },
      ],
    }
    const sols = computeAllBuyableCombinations(player, cost)
    expect(sols.length).toBeGreaterThan(0)
    expect(sols.every((s) => (s.resourcesPaid.wood ?? 0) === 2)).toBe(true)
    expect(sols.every((s) => (s.resourcesPaid.clay ?? 0) === 2)).toBe(true)
  })

  it('6. undefined conditions preserves backward-compatible discount', () => {
    const player = createMockPlayer()
    const cost: ComplexCost = {
      fee: { wood: 3 },
      bonuses: [{ discount: { wood: 1 }, optional: false }],
    }
    const sols = computeAllBuyableCombinations(player, cost)
    expect(sols.some((s) => (s.resourcesPaid.wood ?? 0) === 2)).toBe(true)
  })
})

describe('applyCostModifiers stops propagating redundant conditions', () => {
  it('7. BonusModifier with conditions generates a Bonus without conditions', () => {
    const baseCost: ComplexCost = { fee: { stone: 4 } }
    const modifier: BonusModifier = {
      type: 'bonus',
      cardId: 'C13_WoodSlideHammer',
      appliesTo: ['renovation'],
      discount: { stone: 2 },
      conditions: { houseTypeWood: 1, minNumRooms: 5 },
    }
    const result = applyCostModifiers(baseCost, [modifier])
    expect(result.bonuses).toBeDefined()
    expect(result.bonuses!.length).toBe(1)
    expect(result.bonuses![0].conditions).toBeUndefined()
    expect(result.bonuses![0].discount).toEqual({ stone: 2 })
  })
})
