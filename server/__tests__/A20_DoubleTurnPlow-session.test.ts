import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { A020_DoubleTurnPlow } from '../../shared/cards/A/A020_DoubleTurnPlow'
import { meetsCardPrerequisites } from '../../shared/cards/helpers/prerequisites'

describe('A020_DoubleTurnPlow prerequisite', () => {
  it('blocks when round > 5', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.round = 6
    const player = state.players[0]!
    expect(meetsCardPrerequisites(player, A020_DoubleTurnPlow, state.round, state)).toBe(false)
  })

  it('allows when round <= 5', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.round = 5
    const player = state.players[0]!
    expect(meetsCardPrerequisites(player, A020_DoubleTurnPlow, state.round, state)).toBe(true)
  })
})
