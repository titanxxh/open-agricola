import { describe, expect, it } from 'vitest'
import { enforceAnimalCapacity } from '../effects/animals'
import type { PlayerState } from '../../game/types'

const createPlayer = (): PlayerState => ({
  id: 'p1',
  name: 'P1',
  color: 'red',
  resources: {
    wood: 0,
    clay: 0,
    reed: 0,
    stone: 0,
    food: 0,
    grain: 0,
    vegetable: 0,
    sheep: 4,
    boar: 3,
    cattle: 1,
    begging: 0,
  },
  familySize: 2,
  workersAvailable: 2,
  rooms: 2,
  houseType: 'wood',
  fields: [],
  fences: 0,
  roomTiles: [],
  stableTiles: [],
  improvements: [],
  minorHand: [],
  minorPlayed: [],
  occupationHand: [],
  occupationPlayed: [],
  playedCards: [],
  houseAnimalType: null,
  houseAnimalCount: 0,
  stableAnimals: {},
  newbornCount: 0,
  pastures: [
    {
      id: 'p1',
      size: 2,
      tiles: [
        { row: 0, col: 0 },
        { row: 0, col: 1 },
      ],
      stables: 1,
      animalType: null,
      animalCount: 0,
    },
    {
      id: 'p2',
      size: 3,
      tiles: [
        { row: 1, col: 0 },
        { row: 1, col: 1 },
        { row: 1, col: 2 },
      ],
      stables: 0,
      animalType: null,
      animalCount: 0,
    },
  ],
  fenceSegments: [],
  majorEffects: { wellRounds: 0 },
  startPlayer: false,
})

describe('animal capacity', () => {
  it('reduces animals to capacity', () => {
    const player = createPlayer()
    enforceAnimalCapacity(player)
    expect(
      player.resources.sheep +
        player.resources.boar +
        player.resources.cattle,
    ).toBe(8)
  })
})
