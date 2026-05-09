import { describe, expect, it, beforeEach } from 'vitest'
import { A123_FrameBuilder } from '../../cards-display/A/A123_FrameBuilder'
import { PaymentSolver } from '../../actions/payment'
import { computeAllBuyableCombinations } from '../../actions/payment/internal'
import type {
  BonusModifier,
  ComplexCost,
  PlayerState,
  Resource,
} from '../../contract/types'

const CARD_ID = 'A123_FrameBuilder'

const createMockPlayer = (resources: Partial<Resource>): PlayerState => ({
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
  occupationPlayed: [CARD_ID],
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
})

beforeEach(() => {
  PaymentSolver.clearCache()
})

describe('A123_FrameBuilder', () => {
  it('card is registered and modifier is present in registry', () => {
    expect(A123_FrameBuilder).toBeDefined()
    expect(A123_FrameBuilder.modifiers).toBeDefined()
    // After migration: 2 BonusModifier entries (construct + renovation), each
    // with choices array of 2 options (clay-via-wood, stone-via-wood).
    const modifiers = A123_FrameBuilder.modifiers ?? []
    expect(modifiers.length).toBe(2)
    modifiers.forEach((m) => {
      expect(m.type).toBe('bonus')
      const bm = m as BonusModifier
      expect(bm.optional).toBe(true)
      expect(bm.choices).toBeDefined()
      expect(bm.choices!.length).toBe(2)
    })
    const appliesTo = modifiers.map((m) => (m as BonusModifier).appliesTo.join(','))
    expect(appliesTo).toContain('construct')
    expect(appliesTo).toContain('renovation')
  })

  it('construct cost with both clay and stone yields solutions but NOT a combined clay+stone save', () => {
    // Key BGA-alignment property: at most ONE of the two choices applies per
    // action. Giving enough wood to cover both (2 wood) and a cost that has
    // both clay and stone should NOT produce a solution where BOTH are
    // replaced in one action.
    const player = createMockPlayer({ wood: 2, clay: 2, stone: 2, reed: 0 })
    const cost: ComplexCost = { fee: { clay: 2, stone: 2 } }
    const solutions = computeAllBuyableCombinations(player, cost, undefined, 'construct')
    expect(solutions.length).toBeGreaterThan(0)
    const claySaved = (s: { resourcesPaid: Partial<Record<string, number>> }) =>
      (s.resourcesPaid.clay ?? 0) === 0
    const stoneSaved = (s: { resourcesPaid: Partial<Record<string, number>> }) =>
      (s.resourcesPaid.stone ?? 0) === 0
    const hasBoth = solutions.some((s) => claySaved(s) && stoneSaved(s))
    expect(hasBoth).toBe(false)
    // But each individual save is offered.
    const hasClay = solutions.some((s) => claySaved(s) && !stoneSaved(s))
    const hasStone = solutions.some((s) => stoneSaved(s) && !claySaved(s))
    expect(hasClay).toBe(true)
    expect(hasStone).toBe(true)
  })

  it('construct cost with only clay offers clay-save (1 wood replaces 2 clay)', () => {
    const player = createMockPlayer({ wood: 1, clay: 2, stone: 0, reed: 0 })
    const cost: ComplexCost = { fee: { clay: 2 } }
    const solutions = computeAllBuyableCombinations(player, cost, undefined, 'construct')
    expect(solutions.length).toBeGreaterThan(0)
    // Wood-for-clay swap: pay 0 clay + 1 wood (instead of 2 clay).
    const swapped = solutions.some(
      (s) => (s.resourcesPaid.clay ?? 0) === 0 && (s.resourcesPaid.wood ?? 0) === 1,
    )
    expect(swapped).toBe(true)
  })

  it('renovation cost offers stone-save as a valid solution', () => {
    const player = createMockPlayer({ wood: 1, clay: 0, stone: 2, reed: 2 })
    // Approximate a stone renovation fee for the assertion: 2 stone + 2 reed.
    const cost: ComplexCost = { fee: { stone: 2, reed: 2 } }
    const solutions = computeAllBuyableCombinations(player, cost, undefined, 'renovation')
    expect(solutions.length).toBeGreaterThan(0)
    // Expect at least one solution that replaces all 2 stone with 1 wood.
    const swapped = solutions.some(
      (s) => (s.resourcesPaid.stone ?? 0) === 0 && (s.resourcesPaid.wood ?? 0) === 1,
    )
    expect(swapped).toBe(true)
  })
})
