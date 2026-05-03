import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { C81_MaterialHub } from '../../shared/cards/C/C81_MaterialHub'
import { meetsCardPrerequisites } from '../../shared/cards/helpers/prerequisites'

describe('C81_MaterialHub prerequisite', () => {
  it('blocks when no reed in supply', () => {
    const session = new GameSession()
    const state = session.getState().state
    const player = state.players[0]!
    player.resources.reed = 0
    player.resources.stone = 2
    expect(meetsCardPrerequisites(player, C81_MaterialHub, state.round, state)).toBe(false)
  })

  it('blocks when no stone in supply', () => {
    const session = new GameSession()
    const state = session.getState().state
    const player = state.players[0]!
    player.resources.reed = 2
    player.resources.stone = 0
    expect(meetsCardPrerequisites(player, C81_MaterialHub, state.round, state)).toBe(false)
  })

  it('allows when both reed and stone are >= 1', () => {
    const session = new GameSession()
    const state = session.getState().state
    const player = state.players[0]!
    player.resources.reed = 1
    player.resources.stone = 1
    expect(meetsCardPrerequisites(player, C81_MaterialHub, state.round, state)).toBe(true)
  })
})
