import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { B074_ThickForest } from '../../shared/cards/B/B074_ThickForest'
import { meetsCardPrerequisites } from '../../shared/cards/helpers/prerequisites'

describe('B074_ThickForest prerequisite', () => {
  it('blocks when player has fewer than 5 clay in supply', () => {
    const session = new GameSession()
    const state = session.getState().state
    const player = state.players[0]!
    player.resources.clay = 4
    expect(meetsCardPrerequisites(player, B074_ThickForest, state.round, state)).toBe(false)
  })

  it('allows when player has 5 or more clay', () => {
    const session = new GameSession()
    const state = session.getState().state
    const player = state.players[0]!
    player.resources.clay = 5
    expect(meetsCardPrerequisites(player, B074_ThickForest, state.round, state)).toBe(true)
  })
})
