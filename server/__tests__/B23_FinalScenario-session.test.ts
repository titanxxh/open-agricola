import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { B23_FinalScenario } from '../../shared/cards-display/B/B23_FinalScenario'
import { meetsCardPrerequisites } from '../../shared/cards/helpers/prerequisites'

describe('B23_FinalScenario prerequisite', () => {
  it('blocks when round == 14', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.round = 14
    const player = state.players[0]!
    expect(meetsCardPrerequisites(player, B23_FinalScenario, state.round, state)).toBe(false)
  })

  it('allows when round <= 13', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.round = 13
    const player = state.players[0]!
    expect(meetsCardPrerequisites(player, B23_FinalScenario, state.round, state)).toBe(true)
  })
})
