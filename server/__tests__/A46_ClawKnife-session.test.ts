import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { A46_ClawKnife } from '../../shared/cards-display/A/A46_ClawKnife'
import { meetsCardPrerequisites } from '../../shared/cards/helpers/prerequisites'

describe('A46_ClawKnife prerequisite', () => {
  it('blocks when player has zero pastures', () => {
    const session = new GameSession()
    const state = session.getState().state
    const player = state.players[0]!
    player.pastures = []
    expect(meetsCardPrerequisites(player, A46_ClawKnife, state.round, state)).toBe(false)
  })

  it('allows when player has exactly 1 pasture', () => {
    const session = new GameSession()
    const state = session.getState().state
    const player = state.players[0]!
    player.pastures = [{
      id: 'p1',
      tiles: [{ row: 0, col: 0 }],
      animalType: null,
      animalCount: 0,
      size: 1,
      stables: 0,
    }]
    expect(meetsCardPrerequisites(player, A46_ClawKnife, state.round, state)).toBe(true)
  })

  it('blocks when player has 2 pastures', () => {
    const session = new GameSession()
    const state = session.getState().state
    const player = state.players[0]!
    player.pastures = [
      { id: 'p1', tiles: [{ row: 0, col: 0 }], animalType: null, animalCount: 0, size: 1, stables: 0 },
      { id: 'p2', tiles: [{ row: 1, col: 0 }], animalType: null, animalCount: 0, size: 1, stables: 0 },
    ]
    expect(meetsCardPrerequisites(player, A46_ClawKnife, state.round, state)).toBe(false)
  })
})
