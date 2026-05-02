import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import {
  computeAnimalZones,
  computeInvalidAnimalsForZone,
} from '../../shared/actions/helpers/animal-zones'

import '../../shared/cards/B/B11_Feedyard'

describe('B11_Feedyard getInvalidAnimals', () => {
  const setup = (pastureCount: number) => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    const player = state.players[0]!
    player.minorPlayed.push('B11_Feedyard')
    player.pastures = Array.from({ length: pastureCount }, (_, i) => ({
      id: `p${i + 1}`,
      tiles: [],
      size: 1,
      stables: 0,
      animalType: null,
      animalCount: 0,
    }))
    session.loadState(state)
    return session
  }

  it('zone push carries cardId', () => {
    const session = setup(2)
    const player = session.getState().state.players[0]!
    const zone = computeAnimalZones(player).find(z => z.id === `card:B11_Feedyard`)!
    expect(zone.cardId).toBe('B11_Feedyard')
  })

  it('returns empty when count <= pasture count', () => {
    const session = setup(2)
    const state = session.getState().state
    const player = state.players[0]!
    const zone = computeAnimalZones(player).find(z => z.id === `card:B11_Feedyard`)!
    zone.animalType = 'sheep'
    zone.animalCount = 2
    expect(computeInvalidAnimalsForZone(state, player, zone)).toEqual([])
  })

  it('flags excess beyond pasture count', () => {
    const session = setup(1)
    const state = session.getState().state
    const player = state.players[0]!
    const zone = computeAnimalZones(player).find(z => z.id === `card:B11_Feedyard`)!
    zone.capacity = 3
    zone.animalType = 'boar'
    zone.animalCount = 3
    const invalid = computeInvalidAnimalsForZone(state, player, zone)
    expect(invalid.length).toBe(2)
  })
})
