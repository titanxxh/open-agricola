import { describe, expect, it } from 'vitest'
import { GameSession } from '../game-session'
import { computeAnimalZones } from '../../shared/actions/effects/animals'

import '../../shared/cards/E/E11_PettingZoo'

describe('E11_PettingZoo session', () => {
  const setup = (options?: {
    pastures?: {
      id: string
      size: number
      tiles: { row: number; col: number }[]
      stables: number
      animalType: 'sheep' | 'boar' | 'cattle' | null
      animalCount: number
    }[]
    roomTiles?: { row: number; col: number }[]
    rooms?: number
  }) => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 1

    const player = state.players[0]!
    player.minorPlayed.push('E11_PettingZoo')
    if (options?.pastures) {
      player.pastures = options.pastures
    }
    if (options?.roomTiles) {
      player.roomTiles = options.roomTiles
    }
    if (options?.rooms !== undefined) {
      player.rooms = options.rooms
    }
    session.loadState(state)
    return session
  }

  it('zone exists when pasture is adjacent to house, capacity = rooms', () => {
    // Default GameSession has rooms at (0,0) and (1,0)
    // Pasture tile at (0,1) is adjacent to room at (0,0)
    const session = setup({
      roomTiles: [{ row: 0, col: 0 }, { row: 1, col: 0 }],
      rooms: 2,
      pastures: [
        {
          id: 'p1',
          size: 1,
          tiles: [{ row: 0, col: 1 }],
          stables: 0,
          animalType: null,
          animalCount: 0,
        },
      ],
    })
    const state = session.getState().state
    const player = state.players[0]!

    const zones = computeAnimalZones(player)
    const cardZone = zones.find(z => z.id === 'card:E11_PettingZoo')
    expect(cardZone).toBeDefined()
    expect(cardZone!.zoneType).toBe('card')
    expect(cardZone!.capacity).toBe(2)
    expect(cardZone!.animalType).toBeNull()
  })

  it('no zone when pasture is not adjacent to house', () => {
    const session = setup({
      roomTiles: [{ row: 0, col: 0 }, { row: 1, col: 0 }],
      rooms: 2,
      pastures: [
        {
          id: 'p1',
          size: 1,
          tiles: [{ row: 2, col: 2 }],
          stables: 0,
          animalType: null,
          animalCount: 0,
        },
      ],
    })
    const state = session.getState().state
    const player = state.players[0]!

    const zones = computeAnimalZones(player)
    const cardZone = zones.find(z => z.id === 'card:E11_PettingZoo')
    expect(cardZone).toBeUndefined()
  })

  it('no zone when player has no pastures', () => {
    const session = setup({
      roomTiles: [{ row: 0, col: 0 }, { row: 1, col: 0 }],
      rooms: 2,
      pastures: [],
    })
    const state = session.getState().state
    const player = state.players[0]!

    const zones = computeAnimalZones(player)
    const cardZone = zones.find(z => z.id === 'card:E11_PettingZoo')
    expect(cardZone).toBeUndefined()
  })

  it('capacity matches room count', () => {
    const session = setup({
      roomTiles: [{ row: 0, col: 0 }, { row: 1, col: 0 }, { row: 2, col: 0 }],
      rooms: 3,
      pastures: [
        {
          id: 'p1',
          size: 1,
          tiles: [{ row: 0, col: 1 }],
          stables: 0,
          animalType: null,
          animalCount: 0,
        },
      ],
    })
    const state = session.getState().state
    const player = state.players[0]!

    const zones = computeAnimalZones(player)
    const cardZone = zones.find(z => z.id === 'card:E11_PettingZoo')
    expect(cardZone).toBeDefined()
    expect(cardZone!.capacity).toBe(3)
  })

  it('adjacent check works for pasture tile adjacent to second room', () => {
    // Room at (1,0), pasture tile at (1,1) — adjacent
    const session = setup({
      roomTiles: [{ row: 0, col: 0 }, { row: 1, col: 0 }],
      rooms: 2,
      pastures: [
        {
          id: 'p1',
          size: 1,
          tiles: [{ row: 1, col: 1 }],
          stables: 0,
          animalType: null,
          animalCount: 0,
        },
      ],
    })
    const state = session.getState().state
    const player = state.players[0]!

    const zones = computeAnimalZones(player)
    const cardZone = zones.find(z => z.id === 'card:E11_PettingZoo')
    expect(cardZone).toBeDefined()
    expect(cardZone!.capacity).toBe(2)
  })
})
