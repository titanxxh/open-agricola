import { describe, it, expect } from 'vitest'
import { rollAndCacheCardPick } from '../card-random'
import type { GameState, PlayerState } from '../../../game/types'

const mkPlayer = (): PlayerState => ({
  id: 'p1', name: 'P1',
  resources: {},
  farmGrid: [], pastures: [],
  stableTiles: [], fields: [],
  occupationHand: [], occupationPlayed: [],
  minorHand: [], minorPlayed: [],
  cardStates: {},
} as unknown as PlayerState)

const mkState = (seed: number): GameState => ({
  gameSeed: seed,
  rngTick: 0,
  round: 1,
  roundPhase: 'work',
  players: [],
} as unknown as GameState)

describe('rollAndCacheCardPick', () => {
  it('rolls once, caches the result, and advances rngTick', () => {
    const state = mkState(42)
    const player = mkPlayer()
    const candidates = ['a', 'b', 'c', 'd']
    const pick1 = rollAndCacheCardPick(state, player, 'CARD', 'k', candidates)
    expect(candidates).toContain(pick1)
    expect(state.rngTick).toBe(1)

    // Subsequent call with same key returns cached value, does NOT advance tick
    const pick2 = rollAndCacheCardPick(state, player, 'CARD', 'k', candidates)
    expect(pick2).toBe(pick1)
    expect(state.rngTick).toBe(1)
  })

  it('advances rngTick when a different key is rolled', () => {
    const state = mkState(42)
    const player = mkPlayer()
    rollAndCacheCardPick(state, player, 'CARD', 'k1', ['a', 'b'])
    rollAndCacheCardPick(state, player, 'CARD', 'k2', ['x', 'y'])
    expect(state.rngTick).toBe(2)
  })

  it('is deterministic given the same gameSeed and rngTick sequence', () => {
    const sA = mkState(77)
    const sB = mkState(77)
    const pA = mkPlayer()
    const pB = mkPlayer()
    const picksA = ['k1', 'k2', 'k3'].map((k) =>
      rollAndCacheCardPick(sA, pA, 'C', k, ['a', 'b', 'c']),
    )
    const picksB = ['k1', 'k2', 'k3'].map((k) =>
      rollAndCacheCardPick(sB, pB, 'C', k, ['a', 'b', 'c']),
    )
    expect(picksA).toEqual(picksB)
  })

  it('throws on empty candidates', () => {
    const state = mkState(42)
    const player = mkPlayer()
    expect(() => rollAndCacheCardPick(state, player, 'CARD', 'k', [])).toThrow()
  })

  it('handles undefined initial rngTick (treats as 0)', () => {
    const state = mkState(42)
    delete (state as any).rngTick
    const player = mkPlayer()
    rollAndCacheCardPick(state, player, 'CARD', 'k', ['a', 'b'])
    expect(state.rngTick).toBe(1)
  })
})
