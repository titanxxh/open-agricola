import { describe, it, expect } from 'vitest'
import { GameSession } from '../../../server/game/authoritative-session.ts'
import { playerBoard } from '../index.ts'

describe('Farmyard', () => {
  it('canPlow returns ok on a free initial position', () => {
    const session = new GameSession()
    const state = session.getState().state
    const board = playerBoard(state, 0)
    // 2-player initial farm: rooms occupy (2,0) and (1,0); (0,0) is free
    // and there are no existing fields, so the adjacency rule does not apply.
    const result = board.farmyard.canPlow({ row: 0, col: 0 })
    expect(result.ok).toBe(true)
  })

  it('canPlow rejects a tile occupied by an initial room', () => {
    const session = new GameSession()
    const state = session.getState().state
    const board = playerBoard(state, 0)
    const result = board.farmyard.canPlow({ row: 2, col: 0 })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe('OCCUPIED')
    }
  })

  it("selectableTiles('plow') returns a farm-interaction shape", () => {
    const session = new GameSession()
    const state = session.getState().state
    const board = playerBoard(state, 0)
    const interaction = board.farmyard.selectableTiles('plow')
    expect(interaction).toBeDefined()
    expect((interaction as { farmType?: string }).farmType).toBe('plow')
  })

  it('pastures() is empty on an initial farm (no fences)', () => {
    const session = new GameSession()
    const state = session.getState().state
    const board = playerBoard(state, 0)
    expect(board.farmyard.pastures()).toHaveLength(0)
  })
})
