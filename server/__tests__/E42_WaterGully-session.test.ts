import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { E42_WaterGully } from '../../shared/cards-display/E/E42_WaterGully'
import { meetsCardPrerequisites } from '../../shared/cards/helpers/prerequisites'

describe('E42_WaterGully prerequisite', () => {
  it('blocks when player has not built Major_Well', () => {
    const session = new GameSession()
    const state = session.getState().state
    const player = state.players[0]!
    player.improvements = []
    expect(meetsCardPrerequisites(player, E42_WaterGully, state.round, state)).toBe(false)
  })

  it('allows when player owns Major_Well', () => {
    const session = new GameSession()
    const state = session.getState().state
    const player = state.players[0]!
    player.improvements = ['Major_Well']
    expect(meetsCardPrerequisites(player, E42_WaterGully, state.round, state)).toBe(true)
  })
})
