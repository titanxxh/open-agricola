import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { computeAnimalZones } from '../../shared/domain/animal-zones'

import '../../shared/cards/A/A012_DrinkingTrough'
import '../../shared/cards/D/D011_LawnFertilizer'

const CARD_ID = 'D011_LawnFertilizer'

describe('D011_LawnFertilizer session', () => {
  const setup = () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    return session
  }

  it('size-1 pasture without stable → capacity 3', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!
    player.minorPlayed.push(CARD_ID)
    player.pastures = [
      { id: 'p1', size: 1, stables: 0, tiles: [{ row: 0, col: 0 }], animalType: null, animalCount: 0 },
    ]
    const zones = computeAnimalZones(player)
    expect(zones[0]!.capacity).toBe(3)
  })

  it('size-1 pasture with one stable → capacity 6', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!
    player.minorPlayed.push(CARD_ID)
    player.pastures = [
      { id: 'p1', size: 1, stables: 1, tiles: [{ row: 0, col: 0 }], animalType: null, animalCount: 0 },
    ]
    const zones = computeAnimalZones(player)
    expect(zones[0]!.capacity).toBe(6)
  })

  it('size-1 pasture with A012_DrinkingTrough → capacity 5 (3 + 2)', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!
    player.minorPlayed.push('A012_DrinkingTrough')
    player.minorPlayed.push(CARD_ID)
    player.pastures = [
      { id: 'p1', size: 1, stables: 0, tiles: [{ row: 0, col: 0 }], animalType: null, animalCount: 0 },
    ]
    const zones = computeAnimalZones(player)
    expect(zones[0]!.capacity).toBe(5)
  })

  it('size-2 pasture unaffected (still 4)', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!
    player.minorPlayed.push(CARD_ID)
    player.pastures = [
      { id: 'p1', size: 2, stables: 0, tiles: [{ row: 0, col: 0 }, { row: 0, col: 1 }], animalType: null, animalCount: 0 },
    ]
    const zones = computeAnimalZones(player)
    expect(zones[0]!.capacity).toBe(4)
  })

  it('without D11, size-1 pasture still uses base formula (capacity 2)', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!
    player.pastures = [
      { id: 'p1', size: 1, stables: 0, tiles: [{ row: 0, col: 0 }], animalType: null, animalCount: 0 },
    ]
    const zones = computeAnimalZones(player)
    expect(zones[0]!.capacity).toBe(2)
  })
})
