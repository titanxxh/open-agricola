import { describe, it, expect } from 'vitest'
import type { GameState, PlayerState, Pasture } from '../../../contract/types'
import { breed } from '../breed'
import { getBreedThreshold, type CardEffect } from '../../../cards/card-effects'
import { withActiveRegistry } from '../../../cards/active-registry'
import { CardRegistry } from '../../../cards/registry'
import { E084_DollysMother_impl } from '../../../cards/E/E084_DollysMother'

const makePlayer = (overrides: Partial<PlayerState> = {}): PlayerState =>
  ({
    id: 'p1',
    name: 'P1',
    resources: {
      wood: 0, clay: 0, reed: 0, stone: 0, food: 0, grain: 0,
      vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0,
    },
    pastures: [],
    stableAnimals: {},
    stableTiles: [],
    farmTiles: {},
    rooms: 2,
    workers: [],
    occupations: [],
    occupationHand: [],
    occupationPlayed: [],
    minorPlayed: [],
    minorHand: [],
    improvements: [],
    cardStates: {},
    activeModifiers: [],
    houseAnimalType: null,
    houseAnimalCount: 0,
    ...overrides,
  } as unknown as PlayerState)

const makeState = (player: PlayerState): GameState =>
  ({ players: [player], actionSpaces: [] } as unknown as GameState)

const makePasture = (capacityTiles: number): Pasture => ({
  id: `pasture-${Math.random()}`,
  size: capacityTiles,
  tiles: Array.from({ length: capacityTiles }, () => ({ row: 0, col: 0 })),
  stables: 0,
  animalType: null,
  animalCount: 0,
})

const withEffects = <T>(effects: CardEffect[], fn: () => T): T => {
  const registry = new CardRegistry()
  effects.forEach((effect) => registry.setEffect(effect))
  return withActiveRegistry(registry, fn)
}

describe('breed core helper', () => {
  it('breeds 1 of each type when ≥2 + capacity available', () => {
    const player = makePlayer({
      resources: {
        wood: 0, clay: 0, reed: 0, stone: 0, food: 0, grain: 0,
        vegetable: 0, sheep: 2, boar: 2, cattle: 2, begging: 0,
      },
      pastures: [makePasture(3)],
    } as Partial<PlayerState>)
    const state = makeState(player)
    const { breedSummary } = breed(state, player, { sourceCard: 'harvest' })
    expect(breedSummary.animalCount).toBeGreaterThan(0)
    // 至少一类繁殖成功
    expect(player.resources.sheep + player.resources.boar + player.resources.cattle)
      .toBeGreaterThan(6)
  })

  it('skips an animal when count < 2', () => {
    const player = makePlayer({
      resources: {
        wood: 0, clay: 0, reed: 0, stone: 0, food: 0, grain: 0,
        vegetable: 0, sheep: 1, boar: 2, cattle: 0, begging: 0,
      },
      pastures: [makePasture(3)],
    } as Partial<PlayerState>)
    const state = makeState(player)
    const { breedSummary } = breed(state, player, { sourceCard: 'harvest' })
    expect(breedSummary.resources.sheep).toBeUndefined()
  })

  it('respects animalTypes filter — only breeds boar', () => {
    const player = makePlayer({
      resources: {
        wood: 0, clay: 0, reed: 0, stone: 0, food: 0, grain: 0,
        vegetable: 0, sheep: 2, boar: 2, cattle: 2, begging: 0,
      },
      pastures: [makePasture(3)],
    } as Partial<PlayerState>)
    const state = makeState(player)
    const { breedSummary } = breed(state, player, { sourceCard: 'A165_PigBreeder', animalTypes: ['boar'] })
    expect(breedSummary.resources.sheep).toBeUndefined()
    expect(breedSummary.resources.cattle).toBeUndefined()
    expect(breedSummary.resources.boar).toBe(1)
  })

  it('does not exceed capacity — stops when free capacity exhausted', () => {
    // Default house zone has capacity=1; no pasture, no stable. Only 1 type can breed.
    const player = makePlayer({
      resources: {
        wood: 0, clay: 0, reed: 0, stone: 0, food: 0, grain: 0,
        vegetable: 0, sheep: 4, boar: 4, cattle: 4, begging: 0,
      },
      pastures: [],
    } as Partial<PlayerState>)
    const state = makeState(player)
    const { breedSummary } = breed(state, player, { sourceCard: 'harvest' })
    expect(breedSummary.animalCount).toBe(1)
    expect(breedSummary.animalTypes).toBe(1)
  })

  it('uses default breeding threshold 2 when no modifier applies', () => {
    const player = makePlayer()
    const state = makeState(player)

    expect(getBreedThreshold(state, player, 'sheep', { sourceCard: 'harvest' })).toBe(2)
  })

  it('uses the minimum matching breeding threshold modifier', () => {
    const player = makePlayer({
      minorPlayed: ['TEST_Threshold3', 'TEST_Threshold1'],
    })
    const state = makeState(player)

    const threshold = withEffects([
      {
        id: 'TEST_Threshold3',
        computeBreedThreshold: (_state, _player, animalType) =>
          animalType === 'boar' ? 3 : undefined,
      },
      {
        id: 'TEST_Threshold1',
        computeBreedThreshold: (_state, _player, animalType) =>
          animalType === 'boar' ? 1 : undefined,
      },
    ], () => getBreedThreshold(state, player, 'boar', { sourceCard: 'harvest' }))

    expect(threshold).toBe(1)
  })

  it('breeds through the generic threshold helper', () => {
    const player = makePlayer({
      resources: {
        wood: 0, clay: 0, reed: 0, stone: 0, food: 0, grain: 0,
        vegetable: 0, sheep: 0, boar: 1, cattle: 0, begging: 0,
      },
      pastures: [makePasture(1)],
      minorPlayed: ['TEST_BoarThreshold'],
    } as Partial<PlayerState>)
    const state = makeState(player)

    const result = withEffects([
      {
        id: 'TEST_BoarThreshold',
        computeBreedThreshold: (_state, _player, animalType) =>
          animalType === 'boar' ? 1 : undefined,
      },
    ], () => breed(state, player, { sourceCard: 'harvest' }))

    expect(result.breedSummary.resources.boar).toBe(1)
    expect(player.resources.boar).toBe(2)
  })

  it('includes horses in default harvest breeding when Farmers of the Moor is enabled', () => {
    const player = makePlayer({
      resources: {
        wood: 0, clay: 0, reed: 0, stone: 0, food: 0, grain: 0,
        vegetable: 0, sheep: 0, boar: 0, cattle: 0, horse: 2, begging: 0,
      },
      pastures: [makePasture(1)],
    } as Partial<PlayerState>)
    const state = { ...makeState(player), enableFarmersOfTheMoor: true } as GameState

    const { breedSummary } = breed(state, player, { sourceCard: 'harvest' })

    expect(breedSummary.resources.horse).toBe(1)
    expect(player.resources.horse).toBe(3)
  })

  it('does not breed M084 lying horses', () => {
    const player = makePlayer({
      minorPlayed: ['M084_BogPony'],
      cardStates: {
        M084_BogPony: { extraData: { lyingHorseCount: 1 } },
      },
      resources: {
        wood: 0, clay: 0, reed: 0, stone: 0, food: 0, grain: 0,
        vegetable: 0, sheep: 0, boar: 0, cattle: 0, horse: 2, begging: 0,
      },
      pastures: [makePasture(1)],
    } as Partial<PlayerState>)
    const state = { ...makeState(player), enableFarmersOfTheMoor: true } as GameState

    const { breedSummary } = breed(state, player, { sourceCard: 'harvest' })

    expect(breedSummary.resources.horse).toBeUndefined()
    expect(player.resources.horse).toBe(2)
  })

  it('keeps ordinary card-zone animals breedable', () => {
    const player = makePlayer({
      cardStates: {
        A011_MudPatch: { extraData: { animalCounts: { boar: 1 } } },
      },
      resources: {
        wood: 0, clay: 0, reed: 0, stone: 0, food: 0, grain: 0,
        vegetable: 0, sheep: 0, boar: 2, cattle: 0, begging: 0,
      },
      pastures: [makePasture(1)],
    } as Partial<PlayerState>)
    const state = makeState(player)

    const { breedSummary } = breed(state, player, { sourceCard: 'harvest' })

    expect(breedSummary.resources.boar).toBe(1)
    expect(player.resources.boar).toBe(3)
  })

  it('keeps horses out of default harvest breeding when Farmers of the Moor is disabled', () => {
    const player = makePlayer({
      resources: {
        wood: 0, clay: 0, reed: 0, stone: 0, food: 0, grain: 0,
        vegetable: 0, sheep: 0, boar: 0, cattle: 0, horse: 2, begging: 0,
      },
      pastures: [makePasture(1)],
    } as Partial<PlayerState>)
    const state = makeState(player)

    const { breedSummary } = breed(state, player, { sourceCard: 'harvest' })

    expect(breedSummary.resources.horse).toBeUndefined()
    expect(player.resources.horse).toBe(2)
  })

  it('E84 lowers only harvest sheep breeding threshold and does not write virtual sheep state', () => {
    const player = makePlayer({
      resources: {
        wood: 0, clay: 0, reed: 0, stone: 0, food: 0, grain: 0,
        vegetable: 0, sheep: 1, boar: 0, cattle: 0, begging: 0,
      },
      pastures: [makePasture(1)],
      minorPlayed: ['E084_DollysMother'],
    } as Partial<PlayerState>)
    const state = makeState(player)

    const result = withEffects([E084_DollysMother_impl.effect], () =>
      breed(state, player, { sourceCard: 'harvest' }),
    )

    expect(result.breedSummary.resources.sheep).toBe(1)
    expect(player.resources.sheep).toBe(2)
    expect(player.cardStates.E084_DollysMother?.extraData?.virtualSheepAdded).toBeUndefined()
  })

  it('E84 does not lower card-triggered sheep breeding threshold', () => {
    const player = makePlayer({
      resources: {
        wood: 0, clay: 0, reed: 0, stone: 0, food: 0, grain: 0,
        vegetable: 0, sheep: 1, boar: 0, cattle: 0, begging: 0,
      },
      pastures: [makePasture(1)],
      minorPlayed: ['E084_DollysMother'],
    } as Partial<PlayerState>)
    const state = makeState(player)

    const result = withEffects([E084_DollysMother_impl.effect], () =>
      breed(state, player, { sourceCard: 'A165_PigBreeder', animalTypes: ['sheep'] }),
    )

    expect(result.breedSummary.resources.sheep).toBeUndefined()
    expect(player.resources.sheep).toBe(1)
  })
})
