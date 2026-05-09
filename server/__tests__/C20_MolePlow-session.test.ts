import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { C20_MolePlow } from '../../shared/cards-display/C/C20_MolePlow'
import { meetsCardPrerequisites } from '../../shared/cards/helpers/prerequisites'

describe('C20_MolePlow prerequisite', () => {
  it('blocks when round < 9', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.round = 8
    const player = state.players[0]!
    expect(meetsCardPrerequisites(player, C20_MolePlow, state.round, state)).toBe(false)
  })

  it('allows when round >= 9', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.round = 9
    const player = state.players[0]!
    expect(meetsCardPrerequisites(player, C20_MolePlow, state.round, state)).toBe(true)
  })
})
