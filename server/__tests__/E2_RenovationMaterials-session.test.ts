import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { E2_RenovationMaterials } from '../../shared/cards-display/E/E2_RenovationMaterials'
import { meetsCardPrerequisites } from '../../shared/cards/helpers/prerequisites'

describe('E2_RenovationMaterials prerequisite', () => {
  it('blocks when player no longer lives in a wooden house', () => {
    const session = new GameSession()
    const state = session.getState().state
    const player = state.players[0]!
    player.houseType = 'clay'
    expect(meetsCardPrerequisites(player, E2_RenovationMaterials, state.round, state)).toBe(false)
  })

  it('allows when player still lives in a wooden house', () => {
    const session = new GameSession()
    const state = session.getState().state
    const player = state.players[0]!
    player.houseType = 'wood'
    expect(meetsCardPrerequisites(player, E2_RenovationMaterials, state.round, state)).toBe(true)
  })
})
