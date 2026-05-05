import { describe, it, expect } from 'vitest'
import { GameSession } from '../../../server/game/authoritative-session.ts'
import { Scoring } from '../index.ts'

describe('Scoring namespace', () => {
  it('computeAll returns one entry per player', () => {
    const session = new GameSession()
    const state = session.getState().state
    const all = Scoring.computeAll(state)
    expect(all).toHaveLength(state.players.length)
  })

  it('breakdown returns a valid summary for player 0', () => {
    const session = new GameSession()
    const state = session.getState().state
    const summary = Scoring.breakdown(state, 0)
    expect(summary).toBeDefined()
    expect(typeof summary.total).toBe('number')
    expect(summary.playerId).toBe(state.players[0].id)
    expect(Array.isArray(summary.categories)).toBe(true)
  })

  it('breakdown throws on out-of-range index', () => {
    const session = new GameSession()
    const state = session.getState().state
    expect(() => Scoring.breakdown(state, 99)).toThrow(/no player at index 99/)
  })

  it('totalFor matches breakdown.total for every player', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players.forEach((_p, idx) => {
      expect(Scoring.totalFor(state, idx)).toBe(Scoring.breakdown(state, idx).total)
    })
  })
})
