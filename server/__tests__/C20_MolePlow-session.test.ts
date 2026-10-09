import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { C020_MolePlow } from '../../shared/cards/C/C020_MolePlow'
import { meetsCardPrerequisites } from '../../shared/cards/helpers/prerequisites'

describe('C020_MolePlow prerequisite', () => {
  it('blocks when round < 9', () => {
    const session = new GameSession(42)
    const state = session.getState().state
    state.round = 8
    const player = state.players[0]!
    expect(meetsCardPrerequisites(player, C020_MolePlow, state.round, state)).toBe(false)
  })

  it('allows when round >= 9', () => {
    const session = new GameSession(42)
    const state = session.getState().state
    state.round = 9
    const player = state.players[0]!
    expect(meetsCardPrerequisites(player, C020_MolePlow, state.round, state)).toBe(true)
  })
})
