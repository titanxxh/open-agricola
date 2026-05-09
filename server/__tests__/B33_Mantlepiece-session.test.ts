import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { B33_Mantlepiece } from '../../shared/cards-display/B/B33_Mantlepiece'
import { meetsCardPrerequisites } from '../../shared/cards/helpers/prerequisites'

describe('B33_Mantlepiece prerequisite', () => {
  it('blocks when player still lives in a wooden house', () => {
    const session = new GameSession()
    const state = session.getState().state
    const player = state.players[0]!
    player.houseType = 'wood'
    expect(meetsCardPrerequisites(player, B33_Mantlepiece, state.round, state)).toBe(false)
  })

  it('allows when player lives in a clay house', () => {
    const session = new GameSession()
    const state = session.getState().state
    const player = state.players[0]!
    player.houseType = 'clay'
    expect(meetsCardPrerequisites(player, B33_Mantlepiece, state.round, state)).toBe(true)
  })

  it('allows when player lives in a stone house', () => {
    const session = new GameSession()
    const state = session.getState().state
    const player = state.players[0]!
    player.houseType = 'stone'
    expect(meetsCardPrerequisites(player, B33_Mantlepiece, state.round, state)).toBe(true)
  })
})
