import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { A52_ThrowingAxe } from '../../shared/cards/A/A52_ThrowingAxe'
import { meetsCardPrerequisites } from '../../shared/cards/helpers/prerequisites'

describe('A52_ThrowingAxe prerequisite', () => {
  it('blocks when round < 7', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.round = 6
    const player = state.players[0]!
    expect(meetsCardPrerequisites(player, A52_ThrowingAxe, state.round, state)).toBe(false)
  })

  it('allows when round >= 7', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.round = 7
    const player = state.players[0]!
    expect(meetsCardPrerequisites(player, A52_ThrowingAxe, state.round, state)).toBe(true)
  })
})
