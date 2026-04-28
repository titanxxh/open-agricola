import { describe, expect, it } from 'vitest'
import { createInitialState, normalizeState } from '../state'
import type { GameState, PlayerState } from '../../game/types'

describe('normalizeState backfills PlayerStats for legacy saves', () => {
  it('creates zero-valued stats when player.stats is missing', () => {
    const state = createInitialState(42)
    // Simulate a legacy save: strip stats from every player.
    const legacy: GameState = {
      ...state,
      players: state.players.map((p) => {
        const copy: PlayerState & { stats?: PlayerState['stats'] } = { ...p }
        delete (copy as { stats?: unknown }).stats
        return copy as PlayerState
      }),
    }

    const normalized = normalizeState(legacy)

    normalized.players.forEach((p) => {
      expect(p.stats).toBeDefined()
      expect(p.stats.placedFarmers).toBe(0)
      expect(p.stats.totalRoomsBuilt).toBe(0)
      expect(p.stats.totalMajorBuilt).toBe(0)
      expect(p.stats.totalMinorBuilt).toBe(0)
      expect(p.stats.totalOccupationBuilt).toBe(0)
      expect(p.stats.harvestedGrain).toBe(0)
      expect(p.stats.harvestedVegetable).toBe(0)
      expect(p.stats.resourcesFromBoard).toEqual({})
      expect(p.stats.resourcesFromCards).toEqual({})
      expect(p.stats.resourcesConverted).toEqual({})
      expect(p.stats.foodFromConversion).toEqual({})
      expect(p.stats.draftHistory).toEqual([])
      expect(p.stats.draftDiscarded).toEqual([])
    })
  })

  it('aligns firstPlayerCount with startPlayer flag', () => {
    const state = createInitialState(7)
    const legacy: GameState = {
      ...state,
      players: state.players.map((p) => {
        const copy: PlayerState & { stats?: PlayerState['stats'] } = { ...p }
        delete (copy as { stats?: unknown }).stats
        return copy as PlayerState
      }),
    }
    const normalized = normalizeState(legacy)

    const start = normalized.players.find((p) => p.startPlayer)
    const nonStart = normalized.players.find((p) => !p.startPlayer)
    expect(start?.stats.firstPlayerCount).toBe(1)
    expect(nonStart?.stats.firstPlayerCount).toBe(0)
  })

  it('keeps existing stats untouched when present', () => {
    const state = createInitialState(11)
    state.players[0].stats.placedFarmers = 5
    state.players[0].stats.harvestedGrain = 3
    const normalized = normalizeState(state)
    expect(normalized.players[0].stats.placedFarmers).toBe(5)
    expect(normalized.players[0].stats.harvestedGrain).toBe(3)
  })
})
