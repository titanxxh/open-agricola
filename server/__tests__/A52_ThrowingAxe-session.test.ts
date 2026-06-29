import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { A052_ThrowingAxe } from '../../shared/cards/A/A052_ThrowingAxe'
import { meetsCardPrerequisites } from '../../shared/cards/helpers/prerequisites'

describe('A052_ThrowingAxe prerequisite', () => {
  it('blocks when round < 7', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.round = 6
    const player = state.players[0]!
    expect(meetsCardPrerequisites(player, A052_ThrowingAxe, state.round, state)).toBe(false)
  })

  it('allows when round >= 7', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.round = 7
    const player = state.players[0]!
    expect(meetsCardPrerequisites(player, A052_ThrowingAxe, state.round, state)).toBe(true)
  })
})
