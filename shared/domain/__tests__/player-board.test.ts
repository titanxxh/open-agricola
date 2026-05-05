import { describe, it, expect } from 'vitest'
import { GameSession } from '../../../server/game/authoritative-session.ts'
import { playerBoard } from '../index.ts'

describe('PlayerBoard facade', () => {
  it('exposes farmyard and animals as sub-aggregates', () => {
    const session = new GameSession()
    const state = session.getState().state
    const board = playerBoard(state, 0)
    expect(board.farmyard).toBeDefined()
    expect(board.animals).toBeDefined()
  })

  it('throws on out-of-range index', () => {
    const session = new GameSession()
    const state = session.getState().state
    expect(() => playerBoard(state, 99)).toThrow(/no player at index 99/)
  })

  it('hasRoomFor returns true on initial empty board', () => {
    const session = new GameSession()
    const state = session.getState().state
    const board = playerBoard(state, 0)
    expect(board.hasRoomFor('sheep')).toBe(true)
  })

  it('familySize returns 2 on initial 2-player state', () => {
    const session = new GameSession()
    const state = session.getState().state
    const board = playerBoard(state, 0)
    expect(board.familySize()).toBe(2)
  })

  it('totalAnimalCapacity is at least 1 on bare farm', () => {
    const session = new GameSession()
    const state = session.getState().state
    const board = playerBoard(state, 0)
    expect(board.totalAnimalCapacity()).toBeGreaterThanOrEqual(1)
  })
})
