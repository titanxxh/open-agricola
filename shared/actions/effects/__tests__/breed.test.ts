import { describe, it, expect } from 'vitest'
import type { GameState, PlayerState, Pasture } from '../../../contract/types'
import { breed } from '../breed'

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
})
