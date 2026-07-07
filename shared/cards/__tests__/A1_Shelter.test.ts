import { describe, expect, it } from 'vitest'
import { buildStableFarmInteraction } from '../../domain/farmyard-interaction'
import { getCardEffect } from '../card-effects'
import type { PlayerState, Pasture } from '../../contract/types'

import '../A/A001_Shelter'

const CARD_ID = 'A001_Shelter'

const createPlayer = (overrides?: Partial<PlayerState>): PlayerState =>
  ({
    id: 'p1', name: 'P1', color: 'red',
    resources: {
      wood: 0, clay: 0, reed: 0, stone: 0, food: 0,
      grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0,
    },
    workers: [], rooms: 2, houseType: 'wood',
    fields: [], roomTiles: [{ row: 0, col: 0 }, { row: 1, col: 0 }],
    stableTiles: [],
    improvements: [], minorHand: [], minorPlayed: [],
    occupationHand: [], occupationPlayed: [],
    houseAnimalType: null, houseAnimalCount: 0, stableAnimals: {},
    pastures: [], fenceSegments: [],
    majorEffects: { wellRounds: 0 }, startPlayer: false,
    activeModifiers: [], cardStates: {},
    ...overrides,
  }) as unknown as PlayerState

const makePasture = (size: number, tiles: { row: number; col: number }[]): Pasture => ({
  id: `p-${size}-${tiles[0]!.row}-${tiles[0]!.col}`,
  size,
  tiles,
  stables: 0,
  animalType: null,
  animalCount: 0,
})

describe('A1 Shelter onBuy → stables leaf', () => {
  it('emits a stables leaf with max=1, free exactCost, zoneFilter=pasture-1', () => {
    const effect = getCardEffect(CARD_ID)!
    const flow = effect.onBuy!({} as never, {} as never, {} as never)
    expect(flow).toBeTruthy()
    if (!flow || flow.type !== 'leaf') throw new Error('expected leaf')
    expect(flow.actionId).toBe('stables')
    expect(flow.optional).toBe(true)
    expect(flow.sourceCard).toBe(CARD_ID)
    expect(flow.actionContext?.max).toBe(1)
    expect(flow.actionContext?.zoneFilter).toBe('pasture-1')
    expect(flow.actionContext?.exactCost).toEqual({ wood: 0 })
    expect(flow.actionContext?.costOverride).toBeUndefined()
  })
})

describe('buildStableFarmInteraction with zoneFilter=pasture-1 and max=1', () => {
  it('returns 0 selectable tiles when player has no pastures', () => {
    const player = createPlayer({ pastures: [] })
    const result = buildStableFarmInteraction(player, undefined, { zoneFilter: 'pasture-1', max: 1, exactCost: { wood: 0 } })
    expect(result.selectableTiles).toEqual([])
    expect(result.maxSelections).toBe(0)
  })

  it('returns 0 selectable tiles when player has only size>=2 pastures', () => {
    const player = createPlayer({
      pastures: [
        makePasture(2, [{ row: 2, col: 0 }, { row: 2, col: 1 }]),
      ],
    })
    const result = buildStableFarmInteraction(player, undefined, { zoneFilter: 'pasture-1', max: 1, exactCost: { wood: 0 } })
    expect(result.selectableTiles).toEqual([])
    expect(result.maxSelections).toBe(0)
  })

  it('returns 1-cell pasture tile and max=1 with one size-1 pasture', () => {
    const player = createPlayer({
      pastures: [
        makePasture(1, [{ row: 2, col: 0 }]),
      ],
    })
    const result = buildStableFarmInteraction(player, undefined, { zoneFilter: 'pasture-1', max: 1, exactCost: { wood: 0 } })
    expect(result.selectableTiles).toHaveLength(1)
    expect(result.selectableTiles[0]).toEqual({ row: 2, col: 0 })
    expect(result.maxSelections).toBe(1)
  })

  it('caps maxSelections at 1 even when there are 2+ size-1 pastures', () => {
    // Two distinct size-1 pasture cells (FARM_ROWS=3, FARM_COLS=5 — keep within bounds)
    const player = createPlayer({
      pastures: [
        makePasture(1, [{ row: 2, col: 0 }]),
        makePasture(1, [{ row: 2, col: 1 }]),
      ],
    })
    const result = buildStableFarmInteraction(player, undefined, { zoneFilter: 'pasture-1', max: 1, exactCost: { wood: 0 } })
    expect(result.selectableTiles).toHaveLength(2)
    expect(result.maxSelections).toBe(1)
  })

  it('without zoneFilter, includes all empty tiles (existing behaviour preserved)', () => {
    const player = createPlayer({
      pastures: [makePasture(1, [{ row: 2, col: 0 }])],
      resources: { wood: 99, clay: 0, reed: 0, stone: 0, food: 0,
        grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0 },
    })
    const result = buildStableFarmInteraction(player)
    // Way more than just the 1-cell pasture tile (3 rows × 5 cols = 15 tiles minus 2 rooms = 13)
    expect(result.selectableTiles.length).toBeGreaterThan(1)
  })
})
