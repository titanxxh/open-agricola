import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import {
  computeAnimalZones,
  computeInvalidAnimalsForZone,
} from '../../shared/domain/animal-zones'

import '../../shared/cards/E/E11_PettingZoo'

describe('E11_PettingZoo getInvalidAnimals', () => {
  const setup = () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    const player = state.players[0]!
    player.minorPlayed.push('E11_PettingZoo')
    // Place a pasture adjacent to a room (room at (1,0), pasture at (1,1))
    player.roomTiles = [
      { row: 1, col: 0 },
    ]
    player.rooms = 1
    player.pastures = [{
      id: 'p1',
      tiles: [{ row: 1, col: 1 }],
      size: 1,
      stables: 0,
      animalType: null,
      animalCount: 0,
    }]
    session.loadState(state)
    return session
  }

  it('zone push carries cardId when adjacency holds', () => {
    const session = setup()
    const player = session.getState().state.players[0]!
    const zone = computeAnimalZones(player).find(z => z.id === `card:E11_PettingZoo`)!
    expect(zone.cardId).toBe('E11_PettingZoo')
  })

  it('hook returns empty (BGA mirror; adjacency gate handles activation)', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!
    const zone = computeAnimalZones(player).find(z => z.id === `card:E11_PettingZoo`)!
    zone.animalType = 'sheep'
    zone.animalCount = 1
    expect(computeInvalidAnimalsForZone(state, player, zone)).toEqual([])
  })
})
