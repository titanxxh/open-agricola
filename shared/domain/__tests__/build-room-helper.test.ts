import { describe, expect, it } from 'vitest'
import { tryAddRoomTile } from '../farmyard'
import { getAllTilePositions, positionKey } from '../../game/farm'
import type { FarmTilePosition, PlayerState, Resource } from '../../contract/types'

const emptyResources = (): Resource => ({
  wood: 0,
  clay: 0,
  reed: 0,
  stone: 0,
  food: 0,
  grain: 0,
  vegetable: 0,
  sheep: 0,
  boar: 0,
  cattle: 0,
  begging: 0,
})

const createPlayer = (overrides: Partial<PlayerState> = {}): PlayerState => ({
  id: 'p1',
  name: 'P1',
  color: 'red',
  resources: emptyResources(),
  workers: [],
  rooms: 2,
  houseType: 'wood',
  fields: [],
  roomTiles: [
    { row: 2, col: 0 },
    { row: 1, col: 0 },
  ],
  stableTiles: [],
  improvements: [],
  minorHand: [],
  minorPlayed: [],
  occupationHand: [],
  occupationPlayed: [],
  extraOccupationsFromCards: [],
  playedCards: [],
  houseAnimalType: null,
  houseAnimalCount: 0,
  stableAnimals: {},
  pastures: [],
  fenceSegments: [],
  majorEffects: { wellRounds: 0 },
  startPlayer: false,
  activeModifiers: [],
  cardStates: {},
  ...overrides,
})

describe('tryAddRoomTile', () => {
  it('adds a room tile at a free farmyard position and increments rooms', () => {
    const player = createPlayer()
    const before = player.rooms
    const beforeTiles = player.roomTiles.length

    const ok = tryAddRoomTile(player, 'stone')

    expect(ok).toBe(true)
    expect(player.rooms).toBe(before + 1)
    expect(player.roomTiles.length).toBe(beforeTiles + 1)
    // newly added tile must not collide with existing roomTiles
    const keys = new Set(player.roomTiles.map(positionKey))
    expect(keys.size).toBe(player.roomTiles.length)
  })

  it('does not change houseType', () => {
    const player = createPlayer({ houseType: 'wood' })
    tryAddRoomTile(player, 'stone')
    expect(player.houseType).toBe('wood')
  })

  it('returns false when farmyard has no free tile', () => {
    // Fill every tile: 2 rooms + 13 fields = 15 tiles
    const allTiles = getAllTilePositions()
    const roomTiles: FarmTilePosition[] = [allTiles[0]!, allTiles[1]!]
    const fields = allTiles.slice(2).map((t) => ({
      row: t.row,
      col: t.col,
      stacks: [],
    }))
    const player = createPlayer({ roomTiles, fields })
    const before = player.rooms
    const beforeTiles = player.roomTiles.length

    const ok = tryAddRoomTile(player, 'stone')

    expect(ok).toBe(false)
    expect(player.rooms).toBe(before)
    expect(player.roomTiles.length).toBe(beforeTiles)
  })
})
