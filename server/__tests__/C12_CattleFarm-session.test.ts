import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { computeAnimalZones } from '../../shared/domain/animal-zones'

import '../../shared/cards/C/C12_CattleFarm'

describe('C12_CattleFarm session', () => {
  const setup = (pastureCount: number) => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 1

    const player = state.players[0]!
    // Manually add to minorPlayed (card is not in catalog, so devPlayCard misidentifies it)
    player.minorPlayed.push('C12_CattleFarm')

    // Set up pastures
    player.pastures = []
    for (let i = 0; i < pastureCount; i++) {
      player.pastures.push({
        id: `p${i + 1}`,
        size: 1,
        tiles: [{ row: 0, col: i }],
        stables: 0,
        animalType: null,
        animalCount: 0,
      })
    }

    session.loadState(state)
    return session
  }

  it('card zone exists with capacity equal to pasture count', () => {
    const session = setup(2)
    const state = session.getState().state
    const player = state.players[0]!

    const zones = computeAnimalZones(player)
    const cardZone = zones.find(z => z.id === 'card:C12_CattleFarm')
    expect(cardZone).toBeDefined()
    expect(cardZone!.zoneType).toBe('card')
    expect(cardZone!.capacity).toBe(2)
    expect(cardZone!.animalType).toBe('cattle')
  })

  it('no zone when player has 0 pastures', () => {
    const session = setup(0)
    const state = session.getState().state
    const player = state.players[0]!

    const zones = computeAnimalZones(player)
    const cardZone = zones.find(z => z.id === 'card:C12_CattleFarm')
    expect(cardZone).toBeUndefined()
  })

  it('capacity scales with pasture count', () => {
    const session = setup(4)
    const state = session.getState().state
    const player = state.players[0]!

    const zones = computeAnimalZones(player)
    const cardZone = zones.find(z => z.id === 'card:C12_CattleFarm')
    expect(cardZone).toBeDefined()
    expect(cardZone!.capacity).toBe(4)
  })
})
