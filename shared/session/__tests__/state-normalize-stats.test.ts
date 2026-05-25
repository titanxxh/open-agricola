import { describe, expect, it } from 'vitest'
import { createInitialState, normalizeState } from '../state-bootstrap'

describe('normalizeState current player stats', () => {
  it('keeps existing stats untouched when present', () => {
    const state = createInitialState(11)
    state.players[0].stats.placedFarmers = 5
    state.players[0].stats.harvestedGrain = 3
    const normalized = normalizeState(state)
    expect(normalized.players[0].stats.placedFarmers).toBe(5)
    expect(normalized.players[0].stats.harvestedGrain).toBe(3)
  })
})
