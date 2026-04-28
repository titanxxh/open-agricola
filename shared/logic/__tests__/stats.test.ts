import { describe, it, expect } from 'vitest'
import {
  createInitialPlayerStats,
  incPlacedFarmers,
  incFirstPlayer,
  incRoomsBuilt,
  incMajorBuilt,
  incMinorBuilt,
  incOccupationBuilt,
  incHarvestedGrain,
  incHarvestedVegetable,
  addResourcesFromBoard,
  addResourcesFromCards,
  incResourceConverted,
  addFoodFromConversion,
  recordDraftPick,
  recordDraftPlayed,
  recordDraftDiscarded,
} from '../stats'
import type { PlayerState } from '../../game/types'

const mockPlayer = (isFirstPlayer = false): PlayerState =>
  ({
    id: 'p1',
    stats: createInitialPlayerStats({ isFirstPlayer }),
  } as unknown as PlayerState)

describe('createInitialPlayerStats', () => {
  it('returns zeroed numeric fields and empty dictionaries', () => {
    const stats = createInitialPlayerStats({ isFirstPlayer: false })
    expect(stats).toEqual({
      placedFarmers: 0,
      firstPlayerCount: 0,
      totalRoomsBuilt: 0,
      totalMajorBuilt: 0,
      totalMinorBuilt: 0,
      totalOccupationBuilt: 0,
      harvestedGrain: 0,
      harvestedVegetable: 0,
      resourcesFromBoard: {},
      resourcesFromCards: {},
      resourcesConverted: {},
      foodFromConversion: {},
      draftHistory: [],
      draftDiscarded: [],
    })
  })

  it('sets firstPlayerCount = 1 for the starting first player', () => {
    const stats = createInitialPlayerStats({ isFirstPlayer: true })
    expect(stats.firstPlayerCount).toBe(1)
  })
})

describe('action-count helpers', () => {
  it('incPlacedFarmers', () => {
    const p = mockPlayer()
    incPlacedFarmers(p)
    incPlacedFarmers(p)
    expect(p.stats.placedFarmers).toBe(2)
  })

  it('incFirstPlayer', () => {
    const p = mockPlayer(true)
    expect(p.stats.firstPlayerCount).toBe(1)
    incFirstPlayer(p)
    expect(p.stats.firstPlayerCount).toBe(2)
  })

  it('incRoomsBuilt accumulates count, ignores 0/negative', () => {
    const p = mockPlayer()
    incRoomsBuilt(p, 2)
    incRoomsBuilt(p, 0)
    incRoomsBuilt(p, -1)
    incRoomsBuilt(p, 1)
    expect(p.stats.totalRoomsBuilt).toBe(3)
  })

  it('incMajorBuilt / incMinorBuilt / incOccupationBuilt', () => {
    const p = mockPlayer()
    incMajorBuilt(p)
    incMinorBuilt(p)
    incMinorBuilt(p)
    incOccupationBuilt(p)
    expect(p.stats.totalMajorBuilt).toBe(1)
    expect(p.stats.totalMinorBuilt).toBe(2)
    expect(p.stats.totalOccupationBuilt).toBe(1)
  })
})

describe('harvest helpers', () => {
  it('incHarvestedGrain / incHarvestedVegetable', () => {
    const p = mockPlayer()
    incHarvestedGrain(p, 3)
    incHarvestedVegetable(p, 1)
    expect(p.stats.harvestedGrain).toBe(3)
    expect(p.stats.harvestedVegetable).toBe(1)
  })

  it('ignores zero / negative values', () => {
    const p = mockPlayer()
    incHarvestedGrain(p, 0)
    incHarvestedGrain(p, -2)
    incHarvestedVegetable(p, -1)
    expect(p.stats.harvestedGrain).toBe(0)
    expect(p.stats.harvestedVegetable).toBe(0)
  })
})

describe('resource origin helpers', () => {
  it('addResourcesFromBoard accumulates per resource', () => {
    const p = mockPlayer()
    addResourcesFromBoard(p, { wood: 2 })
    addResourcesFromBoard(p, { wood: 1, clay: 3 })
    expect(p.stats.resourcesFromBoard).toEqual({ wood: 3, clay: 3 })
  })

  it('addResourcesFromCards keeps separate from board', () => {
    const p = mockPlayer()
    addResourcesFromBoard(p, { wood: 1 })
    addResourcesFromCards(p, { wood: 2 })
    expect(p.stats.resourcesFromBoard.wood).toBe(1)
    expect(p.stats.resourcesFromCards.wood).toBe(2)
  })

  it('drops zero / negative entries', () => {
    const p = mockPlayer()
    addResourcesFromBoard(p, { wood: 0, clay: -1, stone: 2 })
    expect(p.stats.resourcesFromBoard).toEqual({ stone: 2 })
  })
})

describe('conversion helpers', () => {
  it('incResourceConverted accumulates per source resource', () => {
    const p = mockPlayer()
    incResourceConverted(p, 'grain', 2)
    incResourceConverted(p, 'grain', 1)
    incResourceConverted(p, 'sheep', 1)
    expect(p.stats.resourcesConverted).toEqual({ grain: 3, sheep: 1 })
  })

  it('addFoodFromConversion records food output keyed by source', () => {
    const p = mockPlayer()
    addFoodFromConversion(p, 'grain', 4)
    addFoodFromConversion(p, 'grain', 2)
    addFoodFromConversion(p, 'sheep', 2)
    expect(p.stats.foodFromConversion).toEqual({ grain: 6, sheep: 2 })
  })

  it('ignores zero / negative counts', () => {
    const p = mockPlayer()
    incResourceConverted(p, 'grain', 0)
    incResourceConverted(p, 'grain', -1)
    addFoodFromConversion(p, 'grain', 0)
    expect(p.stats.resourcesConverted).toEqual({})
    expect(p.stats.foodFromConversion).toEqual({})
  })
})

describe('draft helpers', () => {
  it('recordDraftPick appends', () => {
    const p = mockPlayer()
    recordDraftPick(p, 'A29', 1)
    recordDraftPick(p, 'B12', 2)
    expect(p.stats.draftHistory).toEqual([
      { cardId: 'A29', draftTurn: 1 },
      { cardId: 'B12', draftTurn: 2 },
    ])
  })

  it('recordDraftPick is idempotent', () => {
    const p = mockPlayer()
    recordDraftPick(p, 'A29', 1)
    recordDraftPick(p, 'A29', 1)
    expect(p.stats.draftHistory).toHaveLength(1)
  })

  it('recordDraftPlayed sets playedTurn once', () => {
    const p = mockPlayer()
    recordDraftPick(p, 'A29', 1)
    recordDraftPlayed(p, 'A29', 5)
    expect(p.stats.draftHistory[0].playedTurn).toBe(5)
    recordDraftPlayed(p, 'A29', 9)
    expect(p.stats.draftHistory[0].playedTurn).toBe(5)
  })

  it('recordDraftPlayed no-op for never-drafted cards', () => {
    const p = mockPlayer()
    recordDraftPlayed(p, 'A29', 5)
    expect(p.stats.draftHistory).toEqual([])
  })

  it('recordDraftDiscarded dedupes', () => {
    const p = mockPlayer()
    recordDraftDiscarded(p, 'D1')
    recordDraftDiscarded(p, 'D1')
    recordDraftDiscarded(p, 'D2')
    expect(p.stats.draftDiscarded).toEqual(['D1', 'D2'])
  })
})
