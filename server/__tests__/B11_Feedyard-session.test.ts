import { describe, expect, it } from 'vitest'
import { GameSession } from '../game-session'
import { computeAnimalZones } from '../../shared/actions/effects/animals'

import '../../shared/cards/B/B11_Feedyard'

describe('B11_Feedyard session', () => {
  const setup = (options?: {
    pastures?: {
      id: string
      size: number
      tiles: { row: number; col: number }[]
      stables: number
      animalType: 'sheep' | 'boar' | 'cattle' | null
      animalCount: number
    }[]
  }) => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 1

    const player = state.players[0]!
    player.minorPlayed.push('B11_Feedyard')
    if (options?.pastures) {
      player.pastures = options.pastures
    }
    session.loadState(state)
    return session
  }

  it('zone capacity equals pasture count, any animal type', () => {
    const session = setup({
      pastures: [
        { id: 'p1', size: 1, tiles: [{ row: 2, col: 2 }], stables: 0, animalType: null, animalCount: 0 },
        { id: 'p2', size: 2, tiles: [{ row: 2, col: 3 }, { row: 2, col: 4 }], stables: 0, animalType: null, animalCount: 0 },
        { id: 'p3', size: 1, tiles: [{ row: 3, col: 2 }], stables: 1, animalType: null, animalCount: 0 },
      ],
    })
    const state = session.getState().state
    const player = state.players[0]!

    const zones = computeAnimalZones(player)
    const cardZone = zones.find(z => z.id === 'card:B11_Feedyard')
    expect(cardZone).toBeDefined()
    expect(cardZone!.zoneType).toBe('card')
    expect(cardZone!.capacity).toBe(3)
    expect(cardZone!.animalType).toBeNull()
  })

  it('zone capacity updates when pastures change', () => {
    const session = setup({
      pastures: [
        { id: 'p1', size: 1, tiles: [{ row: 2, col: 2 }], stables: 0, animalType: null, animalCount: 0 },
      ],
    })
    const state = session.getState().state
    const player = state.players[0]!

    let zones = computeAnimalZones(player)
    let cardZone = zones.find(z => z.id === 'card:B11_Feedyard')
    expect(cardZone).toBeDefined()
    expect(cardZone!.capacity).toBe(1)

    // Add another pasture
    player.pastures.push({
      id: 'p2', size: 1, tiles: [{ row: 3, col: 2 }], stables: 0, animalType: null, animalCount: 0,
    })
    zones = computeAnimalZones(player)
    cardZone = zones.find(z => z.id === 'card:B11_Feedyard')
    expect(cardZone).toBeDefined()
    expect(cardZone!.capacity).toBe(2)
  })

  it('no zone when player has no pastures', () => {
    const session = setup({ pastures: [] })
    const state = session.getState().state
    const player = state.players[0]!

    const zones = computeAnimalZones(player)
    const cardZone = zones.find(z => z.id === 'card:B11_Feedyard')
    expect(cardZone).toBeUndefined()
  })
})
