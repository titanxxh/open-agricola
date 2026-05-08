import { describe, expect, it } from 'vitest'
import {
  countUnusedFarmyardSpaces,
  getAllTilePositions,
  getUsedFarmyardTileKeys,
  hasNoUnusedFarmyardSpaces,
  parsePositionKey,
  positionKey,
} from '../farm'
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
  rooms: 2,
  houseType: 'wood',
  fields: [],
  fences: 0,
  roomTiles: [
    { row: 0, col: 0 },
    { row: 0, col: 1 },
  ],
  stableTiles: [],
  improvements: [],
  minorHand: [],
  minorPlayed: [],
  occupationHand: [],
  occupationPlayed: [],houseAnimalType: null,
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

const tileKey = ({ row, col }: FarmTilePosition) => `${row}-${col}`

describe('farm unused space helpers', () => {
  it('round-trips off-board tile keys with negative coordinates', () => {
    const tile = { row: -1, col: 68 }

    expect(parsePositionKey(positionKey(tile))).toEqual(tile)
  })

  it('counts an overlapping pasture and stable tile only once', () => {
    const player = createPlayer({
      fields: [{ row: 1, col: 0, crop: null, remaining: 0 }],
      stableTiles: [{ row: 2, col: 2 }],
      pastures: [
        {
          id: 'pasture-1',
          size: 2,
          tiles: [
            { row: 2, col: 2 },
            { row: 2, col: 3 },
          ],
          stables: 1,
          animalType: null,
          animalCount: 0,
        },
      ],
    })

    expect(Array.from(getUsedFarmyardTileKeys(player)).sort()).toEqual([
      '0-0',
      '0-1',
      '1-0',
      '2-2',
      '2-3',
    ])
    expect(countUnusedFarmyardSpaces(player)).toBe(10)
  })

  it('reports a fully occupied farmyard as having no unused spaces', () => {
    const roomTiles = [
      { row: 0, col: 0 },
      { row: 0, col: 1 },
    ]
    const fieldTile = { row: 0, col: 2, crop: null, remaining: 0 }
    const stableTile = { row: 0, col: 3 }
    const reservedKeys = new Set([
      ...roomTiles.map(tileKey),
      tileKey(fieldTile),
      tileKey(stableTile),
    ])
    const pastureTiles = getAllTilePositions().filter(
      (tile) => !reservedKeys.has(tileKey(tile)),
    )
    const player = createPlayer({
      roomTiles,
      fields: [fieldTile],
      stableTiles: [stableTile],
      pastures: [
        {
          id: 'pasture-full',
          size: pastureTiles.length,
          tiles: pastureTiles,
          stables: 0,
          animalType: null,
          animalCount: 0,
        },
      ],
    })

    expect(countUnusedFarmyardSpaces(player)).toBe(0)
    expect(hasNoUnusedFarmyardSpaces(player)).toBe(true)
  })
})
