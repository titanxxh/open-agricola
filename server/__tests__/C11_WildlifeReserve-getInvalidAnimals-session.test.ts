import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import {
  computeAnimalZones,
  computeInvalidAnimalsForZone,
} from '../../shared/domain/animal-zones'

import '../../shared/cards/C/C11_WildlifeReserve'

describe('C11_WildlifeReserve getInvalidAnimals', () => {
  const setup = () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    const player = state.players[0]!
    player.minorPlayed.push('C11_WildlifeReserve')
    session.loadState(state)
    return session
  }

  const cardZone = (player: ReturnType<typeof setup>['getState'] extends () => infer R ? R extends { state: { players: (infer P)[] } } ? P : never : never) =>
    computeAnimalZones(player as never).find(z => z.id === `card:C11_WildlifeReserve`)!

  it('zone push carries cardId for hook dispatch', () => {
    const session = setup()
    const player = session.getState().state.players[0]!
    const zone = cardZone(player)
    expect(zone.cardId).toBe('C11_WildlifeReserve')
  })

  it('returns empty when at most 1 of each type', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!
    const zone = computeAnimalZones(player).find(z => z.id === `card:C11_WildlifeReserve`)!
    // synthesize 1 sheep
    zone.animalType = 'sheep'
    zone.animalCount = 1
    const invalid = computeInvalidAnimalsForZone(state, player, zone)
    expect(invalid).toEqual([])
  })

  it('flags excess of same type beyond 1', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!
    const zone = computeAnimalZones(player).find(z => z.id === `card:C11_WildlifeReserve`)!
    // synthesize 3 sheep — over per-type cap
    zone.animalType = 'sheep'
    zone.animalCount = 3
    const invalid = computeInvalidAnimalsForZone(state, player, zone)
    // 2 are invalid (kept 1, rejected 2)
    expect(invalid.length).toBe(2)
    expect(invalid.every(m => m.type === 'sheep')).toBe(true)
  })
})
