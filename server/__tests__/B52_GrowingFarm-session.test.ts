import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { B52_GrowingFarm } from '../../shared/cards-display/B/B52_GrowingFarm'
import { meetsCardPrerequisites } from '../../shared/cards/helpers/prerequisites'

describe('B52_GrowingFarm prerequisite', () => {
  it('blocks when covered pasture zones < round - 1', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.round = 5
    const player = state.players[0]!
    player.pastures = [{
      id: 'p1',
      tiles: [{ row: 0, col: 0 }, { row: 1, col: 0 }],
      animalType: null,
      animalCount: 0,
      size: 2,
      stables: 0,
    }]
    expect(meetsCardPrerequisites(player, B52_GrowingFarm, state.round, state)).toBe(false)
  })

  it('allows when covered pasture zones >= round - 1', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.round = 5
    const player = state.players[0]!
    player.pastures = [{
      id: 'p1',
      tiles: [
        { row: 0, col: 0 },
        { row: 1, col: 0 },
        { row: 2, col: 0 },
        { row: 0, col: 1 },
      ],
      animalType: null,
      animalCount: 0,
      size: 4,
      stables: 0,
    }]
    expect(meetsCardPrerequisites(player, B52_GrowingFarm, state.round, state)).toBe(true)
  })
})
