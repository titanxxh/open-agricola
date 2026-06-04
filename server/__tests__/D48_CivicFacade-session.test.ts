import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { D48_CivicFacade } from '../../shared/cards/D/D48_CivicFacade'
import { meetsCardPrerequisites } from '../../shared/cards/helpers/prerequisites'

describe('D48_CivicFacade prerequisite', () => {
  it('blocks when player has fewer than 3 rooms', () => {
    const session = new GameSession()
    const state = session.getState().state
    const player = state.players[0]!
    player.rooms = 2
    expect(meetsCardPrerequisites(player, D48_CivicFacade, state.round, state)).toBe(false)
  })

  it('allows when player has 3+ rooms', () => {
    const session = new GameSession()
    const state = session.getState().state
    const player = state.players[0]!
    player.rooms = 3
    expect(meetsCardPrerequisites(player, D48_CivicFacade, state.round, state)).toBe(true)
  })
})
