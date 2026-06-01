import { describe, expect, it } from 'vitest'
import type { FenceSegment, GameState, PlayerState, Resource } from '../../contract/types'
import { getPlayerPanelSupplySummary } from '../player-panel-summary'

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

const ownFence = (ownerPlayerId: string, edge: string): FenceSegment => ({
  edge,
  type: 'fence',
  source: { kind: 'own', ownerPlayerId },
})

const borrowedFence = (ownerPlayerId: string, edge: string): FenceSegment => ({
  edge,
  type: 'fence',
  source: { kind: 'borrowed', ownerPlayerId },
})

const palisade = (ownerPlayerId: string, edge: string): FenceSegment => ({
  edge,
  type: 'palisade',
  source: { kind: 'own', ownerPlayerId },
})

const player = (overrides: Partial<PlayerState> = {}): PlayerState => ({
  id: overrides.id ?? 'p1',
  name: overrides.name ?? 'Alice',
  color: overrides.color ?? 'red',
  resources: resources(),
  workers: [
    { id: '1', isActive: true, isNewborn: false },
    { id: '2', isActive: true, isNewborn: false },
    { id: '3', isActive: false, isNewborn: false },
    { id: '4', isActive: false, isNewborn: false },
    { id: '5', isActive: false, isNewborn: false },
  ],
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
  ...overrides,
})

const state = (players: PlayerState[]): GameState => ({ players } as GameState)

describe('player panel fence summary', () => {
  it('summarizes own ordinary fence segments against the ordinary fence limit', () => {
    const p = player({
      fenceSegments: Array.from({ length: 14 }, (_, index) =>
        ownFence('p1', `H-0-${index}`),
      ),
    })

    expect(getPlayerPanelSupplySummary(state([p]), p).fence).toEqual({
      used: 14,
      limit: 15,
    })
  })

  it('lowers the viewed player fence denominator when own fence supply is consumed', () => {
    const p = player({
      fenceSegments: Array.from({ length: 3 }, (_, index) =>
        ownFence('p1', `H-0-${index}`),
      ),
      supplyTokensConsumed: { fence: 2 },
    })

    expect(getPlayerPanelSupplySummary(state([p]), p).fence).toEqual({
      used: 3,
      limit: 13,
    })
  })

  it('counts borrowed fences in the borrower numerator and denominator', () => {
    const borrower = player({
      fenceSegments: [
        ...Array.from({ length: 15 }, (_, index) => ownFence('p1', `H-0-${index}`)),
        borrowedFence('p2', 'V-0-0'),
        borrowedFence('p2', 'V-0-1'),
      ],
    })
    const donor = player({ id: 'p2', name: 'Bob', color: 'blue', supplyTokensConsumed: { fence: 2 } })

    expect(getPlayerPanelSupplySummary(state([borrower, donor]), borrower).fence).toEqual({
      used: 17,
      limit: 17,
    })
  })

  it('reflects borrowed fence supply consumption on the donor denominator', () => {
    const borrower = player({
      fenceSegments: [borrowedFence('p2', 'V-0-0'), borrowedFence('p2', 'V-0-1')],
    })
    const donor = player({ id: 'p2', name: 'Bob', color: 'blue', supplyTokensConsumed: { fence: 2 } })

    expect(getPlayerPanelSupplySummary(state([borrower, donor]), donor).fence).toEqual({
      used: 0,
      limit: 13,
    })
  })

  it('counts palisades in the current farm numerator and denominator', () => {
    const p = player({
      fenceSegments: [
        ownFence('p1', 'H-0-0'),
        ownFence('p1', 'H-0-1'),
        ownFence('p1', 'H-0-2'),
        ownFence('p1', 'H-0-3'),
        palisade('p1', 'V-0-0'),
        palisade('p1', 'V-0-1'),
        palisade('p1', 'V-0-2'),
      ],
    })

    expect(getPlayerPanelSupplySummary(state([p]), p).fence).toEqual({
      used: 7,
      limit: 18,
    })
  })
})
