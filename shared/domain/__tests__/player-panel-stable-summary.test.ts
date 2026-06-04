import { describe, expect, it } from 'vitest'
import type { GameState, PlayerState, Resource, Worker } from '../../contract/types'
import { computeAnimalZones } from '../animal-zones'
import { getPlayerPanelSupplySummary } from '../player-panel-summary'
import { getStableCountForCards } from '../stables'

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

const worker = (id: string, isActive: boolean): Worker => ({
  id,
  isActive,
})

const player = (overrides: Partial<PlayerState> = {}): PlayerState => ({
  id: 'p1',
  name: 'Alice',
  color: 'red',
  resources: resources(),
  workers: [
    worker('1', true),
    worker('2', true),
    worker('3', false),
    worker('4', false),
    worker('5', false),
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

const state = (
  players: PlayerState[],
  overrides: Partial<GameState> = {},
): GameState => ({
  players,
  actionSpaces: [],
  futureMeeples: [],
  pendingFutureMeeples: [],
  round: 1,
  roundActionOrder: [],
  ...overrides,
} as unknown as GameState)

const stableSummary = (
  p: PlayerState,
  s: GameState = state([p]),
) => getPlayerPanelSupplySummary(s, p).stable

describe('player panel stable supply summary', () => {
  it('summarizes the default stable supply as unused out of four', () => {
    const p = player()

    expect(stableSummary(p)).toEqual({ used: 0, limit: 4 })
  })

  it('lowers the denominator when stable supply tokens are permanently consumed', () => {
    const p = player({ supplyTokensConsumed: { stable: 1 } })

    expect(stableSummary(p)).toEqual({ used: 0, limit: 3 })
  })

  it('counts ordinary built stable tiles in the numerator', () => {
    const p = player({
      stableTiles: [
        { row: 0, col: 0 },
        { row: 1, col: 0 },
      ],
    })

    expect(stableSummary(p)).toEqual({ used: 2, limit: 4 })
  })

  it('counts special stables that consume supply without adding animal capacity', () => {
    const p = player({
      cardStates: {
        B85_FarmHand: { extraData: { position: { row: 1, col: 1 } } },
      },
    })
    const s = state([p])

    expect(stableSummary(p, s)).toEqual({ used: 1, limit: 4 })
    expect(getStableCountForCards(p)).toBe(1)
    expect(computeAnimalZones(p, s).filter((zone) => zone.zoneType === 'stable')).toHaveLength(0)
  })

  it('counts future stable reservations from queued future meeples', () => {
    const p = player()
    const s = state([p], {
      futureMeeples: [
        {
          id: 'future-stable-1',
          cardId: 'FutureStableCard',
          playerId: p.id,
          round: 5,
          actionId: null,
          resources: { stable: 1 },
        },
      ],
    })

    expect(stableSummary(p, s)).toEqual({ used: 1, limit: 4 })
  })

  it('keeps A89 target rounds as future reservations without double-counting queued entries', () => {
    const p = player({
      cardStates: {
        A89_StablePlanner: { extraData: { targetRounds: [5, 8] } },
      },
    })
    const s = state([p], {
      futureMeeples: [
        {
          id: 'A89-p1-5',
          cardId: 'A89_StablePlanner',
          playerId: p.id,
          round: 5,
          actionId: null,
          resources: { stable: 1 },
        },
        {
          id: 'A89-p1-8',
          cardId: 'A89_StablePlanner',
          playerId: p.id,
          round: 8,
          actionId: null,
          resources: { stable: 1 },
        },
      ],
    })

    expect(stableSummary(p, s)).toEqual({ used: 2, limit: 4 })
  })

  it('counts action-space stable reservations in the numerator', () => {
    const p = player({
      cardStates: {
        E148_Lazybones: {
          extraData: { reservedActionSpaces: ['grain-seeds', 'farm-expansion'] },
        },
      },
    })

    expect(stableSummary(p)).toEqual({ used: 2, limit: 4 })
  })

  it('keeps supply usage distinct from card-facing stable count', () => {
    const p = player({
      stableTiles: [{ row: 0, col: 0 }],
      cardStates: {
        A89_StablePlanner: { extraData: { targetRounds: [5] } },
      },
    })

    expect(getStableCountForCards(p)).toBe(1)
    expect(stableSummary(p)).toEqual({ used: 2, limit: 4 })
  })

  it('summarizes the viewed player instead of the current player', () => {
    const current = player({ id: 'p1', name: 'Alice' })
    const viewed = player({
      id: 'p2',
      name: 'Bob',
      color: 'blue',
      stableTiles: [
        { row: 0, col: 0 },
        { row: 0, col: 1 },
      ],
      supplyTokensConsumed: { stable: 1 },
    })

    expect(stableSummary(viewed, state([current, viewed]))).toEqual({ used: 2, limit: 3 })
  })
})
