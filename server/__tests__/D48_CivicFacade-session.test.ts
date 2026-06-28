import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { D048_CivicFacade } from '../../shared/cards/D/D048_CivicFacade'
import { meetsCardPrerequisites } from '../../shared/cards/helpers/prerequisites'

describe('D048_CivicFacade prerequisite', () => {
  it('blocks when player has fewer than 3 rooms', () => {
    const session = new GameSession()
    const state = session.getState().state
    const player = state.players[0]!
    player.rooms = 2
    expect(meetsCardPrerequisites(player, D048_CivicFacade, state.round, state)).toBe(false)
  })

  it('allows when player has 3+ rooms', () => {
    const session = new GameSession()
    const state = session.getState().state
    const player = state.players[0]!
    player.rooms = 3
    expect(meetsCardPrerequisites(player, D048_CivicFacade, state.round, state)).toBe(true)
  })
})
