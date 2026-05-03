import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { A13_RenovationCompany } from '../../shared/cards/A/A13_RenovationCompany'
import { meetsCardPrerequisites } from '../../shared/cards/helpers/prerequisites'

describe('A13_RenovationCompany prerequisite', () => {
  it('blocks when house is not wooden or rooms != 2', () => {
    const session = new GameSession()
    const state = session.getState().state
    const player = state.players[0]!
    player.houseType = 'clay'
    expect(meetsCardPrerequisites(player, A13_RenovationCompany, state.round, state)).toBe(false)
  })

  it('allows when in wooden house with exactly 2 rooms', () => {
    const session = new GameSession()
    const state = session.getState().state
    const player = state.players[0]!
    player.houseType = 'wood'
    player.rooms = 2
    expect(meetsCardPrerequisites(player, A13_RenovationCompany, state.round, state)).toBe(true)
  })
})
