import { describe, expect, it } from 'vitest'
import { GameSession } from '../game-session'
import { meetsCardPrerequisites } from '../../shared/cards/helpers/prerequisites'

import '../../shared/cards/E/E16_BriarHedge'
import { E16_BriarHedge } from '../../shared/cards/E/E16_BriarHedge'

describe('E16_BriarHedge session', () => {
  const setup = () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    return session
  }

  it('blocked without any animals', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!
    expect(meetsCardPrerequisites(player, E16_BriarHedge, state.round, state)).toBe(false)
  })

  it('blocked with only sheep + pig (missing cattle)', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!
    player.pastures = [
      { id: 'p1', size: 1, stables: 0, tiles: [{ row: 0, col: 0 }], animalType: 'sheep', animalCount: 1 },
      { id: 'p2', size: 1, stables: 0, tiles: [{ row: 0, col: 1 }], animalType: 'boar', animalCount: 1 },
    ]
    expect(meetsCardPrerequisites(player, E16_BriarHedge, state.round, state)).toBe(false)
  })

  it('playable with 1 of each animal type on the board', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!
    player.pastures = [
      { id: 'p1', size: 1, stables: 0, tiles: [{ row: 0, col: 0 }], animalType: 'sheep', animalCount: 1 },
      { id: 'p2', size: 1, stables: 0, tiles: [{ row: 0, col: 1 }], animalType: 'boar', animalCount: 1 },
      { id: 'p3', size: 1, stables: 0, tiles: [{ row: 0, col: 2 }], animalType: 'cattle', animalCount: 1 },
    ]
    expect(meetsCardPrerequisites(player, E16_BriarHedge, state.round, state)).toBe(true)
  })

  it('animals in house and stables count', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!
    player.houseAnimalType = 'sheep'
    player.houseAnimalCount = 1
    player.stableAnimals = { '0-0': 'boar' }
    player.pastures = [
      { id: 'p3', size: 1, stables: 0, tiles: [{ row: 1, col: 0 }], animalType: 'cattle', animalCount: 1 },
    ]
    expect(meetsCardPrerequisites(player, E16_BriarHedge, state.round, state)).toBe(true)
  })
})
