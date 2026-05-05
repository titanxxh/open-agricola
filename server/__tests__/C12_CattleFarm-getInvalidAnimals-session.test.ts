import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import {
  computeAnimalZones,
  computeInvalidAnimalsForZone,
} from '../../shared/domain/animal-zones'

import '../../shared/cards/C/C12_CattleFarm'

describe('C12_CattleFarm getInvalidAnimals', () => {
  const setup = (pastureCount: number) => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    const player = state.players[0]!
    player.minorPlayed.push('C12_CattleFarm')
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

  it('zone push carries cardId for hook dispatch', () => {
    const session = setup(2)
    const player = session.getState().state.players[0]!
    const zone = computeAnimalZones(player).find(z => z.id === `card:C12_CattleFarm`)!
    expect(zone.cardId).toBe('C12_CattleFarm')
  })

  it('returns empty when count <= pasture count', () => {
    const session = setup(2)
    const state = session.getState().state
    const player = state.players[0]!
    const zone = computeAnimalZones(player).find(z => z.id === `card:C12_CattleFarm`)!
    zone.animalType = 'cattle'
    zone.animalCount = 2
    expect(computeInvalidAnimalsForZone(state, player, zone)).toEqual([])
  })

  it('flags excess cattle beyond pasture count', () => {
    const session = setup(1)
    const state = session.getState().state
    const player = state.players[0]!
    const zone = computeAnimalZones(player).find(z => z.id === `card:C12_CattleFarm`)!
    // synthesize override: zone capacity bumped to allow > pasture count for test
    zone.capacity = 3
    zone.animalType = 'cattle'
    zone.animalCount = 3
    const invalid = computeInvalidAnimalsForZone(state, player, zone)
    expect(invalid.length).toBe(2)
    expect(invalid.every(m => m.type === 'cattle')).toBe(true)
  })
})
