import { describe, it, expect } from 'vitest'
import { createInitialPlayerStats } from '../stats'

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
