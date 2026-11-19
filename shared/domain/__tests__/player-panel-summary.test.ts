import { describe, expect, it } from 'vitest'
import type { GameState, GuestRecord, PlayerState, Resource, Worker } from '../../contract/types'
import { getPlayerPanelSupplySummary } from '../player-panel-summary'
import { activateSmallestInactive } from '../player'

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
  isNewborn = false,
  removedFromSupply = false,
): Worker => ({
  id,
  isActive,
  isNewborn,
  removedFromSupply,
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
  houseAnimals: {},
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

const state = (p: PlayerState): GameState => ({
  players: [p],
  actionSpaces: [
    {
      id: 'family-growth',
      nameKey: 'actions.family-growth.name',
      descriptionKey: 'actions.family-growth.description',
      roundAvailable: 1,
      gainPerRound: {},
      resources: resources(),
      takenBy: [],
      canBeExecutedByPlayer: () => true,
      execute: () => ({ type: 'ok' }),
    },
  ],
} as unknown as GameState)

describe('player panel summary family and housing capacity', () => {
  it('summarizes default family, rooms, and effective housing capacity', () => {
    const p = player()

    expect(getPlayerPanelSupplySummary(state(p), p)).toMatchObject({
      family: { used: 2, limit: 5 },
      rooms: { count: 2 },
      housingCapacity: { value: 2 },
    })
  })

  it('counts newborns as active family members', () => {
    const p = player({
      workers: [
        worker('1', true),
        worker('2', true),
        worker('3', true, true),
        worker('4', false),
        worker('5', false),
      ],
    })

    expect(getPlayerPanelSupplySummary(state(p), p).family).toEqual({ used: 3, limit: 5 })
  })

  it('excludes removed family tokens from the denominator and activation supply', () => {
    const p = player({
      workers: [
        worker('1', true),
        worker('2', true),
        worker('3', false),
        worker('4', false),
        worker('5', false, false, true),
      ],
    })
    const s = state(p)

    expect(getPlayerPanelSupplySummary(s, p).family).toEqual({ used: 2, limit: 4 })
    p.workers.find((w) => w.id === '3')!.removedFromSupply = true
    p.workers.find((w) => w.id === '4')!.removedFromSupply = true

    expect(activateSmallestInactive(p)).toBe(null)
  })
})

describe('player panel summary pending Guests', () => {
  const guest = (id: string, overrides: Partial<GuestRecord> = {}): GuestRecord =>
    ({ id, sourceCardId: 'CI073_Guest', round: 4, ...overrides })
  const inRound = (p: PlayerState, round: number): GameState => ({ ...state(p), round })

  it('counts the Guests the player can still dispatch this round, next to an unchanged family', () => {
    const p = player({ guests: [guest('guest:1'), guest('guest:2', { where: { kind: 'accumulation' } })] })

    expect(getPlayerPanelSupplySummary(inRound(p, 4), p)).toMatchObject({
      family: { used: 2, limit: 5 },
      guests: { pending: 2 },
    })
  })

  it('has no Guest entry while none is pending: a later round\'s Guest waits for its round, a dispatched one is spent', () => {
    const p = player({ guests: [guest('guest:1', { round: 5 }), guest('guest:2', { dispatched: true })] })

    expect(getPlayerPanelSupplySummary(inRound(p, 4), p)).not.toHaveProperty('guests')
    expect(getPlayerPanelSupplySummary(inRound(p, 5), p).guests).toEqual({ pending: 1 })
    const without = player()
    expect(getPlayerPanelSupplySummary(inRound(without, 4), without)).not.toHaveProperty('guests')
  })
})
