import { describe, expect, it } from 'vitest'
import type { ActionFlow, GameState, PlayerState, Resource } from '../../contract/types'
import { readCardExtraData } from '../helpers/card-state'
import { C24_BedintheGrainField_impl } from '../C/C24_BedintheGrainField'

const CARD_ID = 'C24_BedintheGrainField'

const resource = (overrides: Partial<Resource> = {}): Resource => ({
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
  ...overrides,
})

const player = (overrides: Partial<PlayerState> = {}): PlayerState => ({
  id: 'p1',
  name: 'P1',
  color: 'red',
  resources: resource(),
  workers: [
    { id: '1', isActive: true, isNewborn: false },
    { id: '2', isActive: true, isNewborn: false },
    { id: '3', isActive: false, isNewborn: false },
    { id: '4', isActive: false, isNewborn: false },
    { id: '5', isActive: false, isNewborn: false },
  ],
  rooms: 3,
  houseType: 'wood',
  fields: [],
  roomTiles: [],
  stableTiles: [],
  improvements: [],
  minorHand: [],
  minorPlayed: [CARD_ID],
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
  stats: {
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
  },
  ...overrides,
})

const state = (p: PlayerState): GameState => ({
  round: 4,
  roundPhase: 'harvest',
  currentPlayerIndex: 0,
  players: [p],
  actionSpaces: [],
  log: [],
  roundStartSnapshot: null,
  roundActionOrder: [],
  gameSeed: 1,
  availableMajorImprovements: [],
  futureMeeples: [],
  pendingFutureMeeples: [],
  gameOver: false,
  workPhaseObtainedResources: {},
} as unknown as GameState)

const effect = C24_BedintheGrainField_impl.effect!

describe('C24_BedintheGrainField', () => {
  it('onBuy marks the next harvest as ready', () => {
    const p = player()

    effect.onBuy!(state(p), p)

    expect(readCardExtraData<boolean>(p, CARD_ID, 'nextHarvestReady')).toBe(true)
  })

  it('returns an optional family-growth leaf and clears the marker when there is room', () => {
    const p = player()
    effect.onBuy!(state(p), p)

    const flow = effect.onStartHarvest!(state(p), p) as Extract<ActionFlow, { type: 'leaf' }>

    expect(readCardExtraData<boolean>(p, CARD_ID, 'nextHarvestReady')).toBe(false)
    expect(flow).toMatchObject({
      type: 'leaf',
      actionId: 'family-growth',
      optional: true,
      sourceCard: CARD_ID,
    })
  })

  it('clears the marker and returns no flow when there is no room', () => {
    const p = player({ rooms: 2 })
    effect.onBuy!(state(p), p)

    const flow = effect.onStartHarvest!(state(p), p)

    expect(flow).toBeUndefined()
    expect(readCardExtraData<boolean>(p, CARD_ID, 'nextHarvestReady')).toBe(false)
  })

  it('only triggers for the next harvest', () => {
    const p = player()
    effect.onBuy!(state(p), p)

    expect(effect.onStartHarvest!(state(p), p)).toBeDefined()
    expect(effect.onStartHarvest!(state(p), p)).toBeUndefined()
    expect(readCardExtraData<boolean>(p, CARD_ID, 'nextHarvestReady')).toBe(false)
  })
})
