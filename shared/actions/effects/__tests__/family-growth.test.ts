import { describe, expect, it } from 'vitest'
import type { GameState, PlayerState, Resource, Worker } from '../../../contract/types'
import { familyGrowthAction } from '../family-growth'

const resources = (): Resource => ({
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

const stats = (): PlayerState['stats'] => ({
  placedFarmers: 0,
  firstPlayerCount: 0,
  totalRoomsBuilt: 0,
  totalMajorBuilt: 0,
  totalMinorBuilt: 0,
  totalOccupationBuilt: 0,
  harvestedGrain: 0,
  harvestedVegetable: 0,
  resourcesFromBoard: {},
  resourcesFromCards: {},
  resourcesConverted: {},
  foodFromConversion: {},
  draftHistory: [],
  draftDiscarded: [],
})

const worker = (
  id: string,
  isActive: boolean,
  removedFromSupply = false,
): Worker => ({
  id,
  isActive,
  isNewborn: false,
  removedFromSupply,
})

const player = (workers: Worker[]): PlayerState => ({
  id: 'p1',
  name: 'Alice',
  color: 'red',
  resources: resources(),
  workers,
  rooms: 2,
  houseType: 'wood',
  fields: [],
  roomTiles: [],
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
  stats: stats(),
  supplyTokensConsumed: {},
})

const state = (p: PlayerState): GameState => ({
  players: [p],
  actionSpaces: [],
} as unknown as GameState)

describe('family-growth supply gate', () => {
  it('does not allow skip-room growth when all inactive workers were removed from supply', () => {
    const p = player([
      worker('1', true),
      worker('2', true),
      worker('3', false, true),
      worker('4', false, true),
      worker('5', false, true),
    ])

    expect(
      familyGrowthAction.canBeExecutedByPlayer!(
        state(p),
        p,
        { actionContext: { skipRoomCheck: true } },
      ),
    ).toBe(false)
  })
})
