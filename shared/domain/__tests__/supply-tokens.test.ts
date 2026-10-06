import { beforeEach, describe, expect, it } from 'vitest'
import { E074_AshTrees } from '../../cards/E/E074_AshTrees'
import { E148_Lazybones } from '../../cards/E/E148_Lazybones'
import { B085_FarmHand } from '../../cards/B/B085_FarmHand'
import type { PlayerState } from '../../contract/types'
import { CardRegistry } from '../../cards/registry'
import { setActiveCardRegistry, withActiveRegistry } from '../../cards/active-registry'
import {
  getAvailableStableSupplyCount,
  getOwnOrdinaryFenceBuildLimit,
  getOwnOrdinaryFenceReserveCount,
  MAX_STABLE_PIECES,
} from '../supply-tokens'

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

const player = (overrides: Partial<PlayerState> = {}): PlayerState => ({
  id: 'p1',
  name: 'Alice',
  color: 'red',
  resources: {
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
  },
  workers: [],
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

describe('supply token helpers', () => {
  beforeEach(() => {
    const registry = new CardRegistry()
    for (const source of [E074_AshTrees, E148_Lazybones, B085_FarmHand]) registry.loadImpl(source.id, source.impl)
    setActiveCardRegistry(registry)
  })
  it('aggregates source-owned reservations without interpreting either source storage', () => {
    const registry = new CardRegistry()
    registry.loadImpl('CUSTOM_FenceCache', { effect: {
      id: 'CUSTOM_FenceCache',
      getRuleContributions: (p) => ({ reservedSupply: { fence: Number(p.cardStates.CUSTOM_FenceCache?.extraData?.pieces) } }),
    } })
    registry.loadImpl('CUSTOM_StableCache', { effect: {
      id: 'CUSTOM_StableCache',
      getRuleContributions: () => ({ reservedSupply: { fence: 2.9, stable: 2 } }),
    } })
    const p = player({
      minorPlayed: ['CUSTOM_FenceCache', 'CUSTOM_StableCache', 'CUSTOM_FenceCache'],
      cardStates: { CUSTOM_FenceCache: { extraData: { pieces: 3 } } },
    })
    const before = JSON.stringify(p)
    withActiveRegistry(registry, () => {
      expect(getOwnOrdinaryFenceReserveCount(p)).toBe(10)
      expect(getAvailableStableSupplyCount({ players: [p] } as never, p)).toBe(2)
    })
    expect(JSON.stringify(p)).toBe(before)
  })
  it.each([undefined, 0, -2, NaN, Infinity, '3', 1.9, 100])('normalizes a reservation of %s without making reserve negative', (value) => {
    const registry = new CardRegistry()
    registry.loadImpl('CUSTOM_Reservation', { effect: { id: 'CUSTOM_Reservation',
      getRuleContributions: () => ({ reservedSupply: { fence: value as number, stable: value as number } }),
    } })
    const p = player({ minorPlayed: ['CUSTOM_Reservation'] })
    withActiveRegistry(registry, () => {
      const reserved = value === 1.9 ? 1 : value === 100 ? 100 : 0
      expect(getOwnOrdinaryFenceReserveCount(p)).toBe(Math.max(0, 15 - reserved))
      expect(getAvailableStableSupplyCount({ players: [p] } as never, p)).toBe(Math.max(0, 4 - reserved))
    })
  })
  it('separates fence reserve from build limit and card-held fences', () => {
    const p = player({
      fenceSegments: [
        { edge: '0,0-H', type: 'fence', source: { kind: 'own', ownerPlayerId: 'p1' } },
        { edge: '0,1-H', type: 'palisade', source: { kind: 'own', ownerPlayerId: 'p1' } },
      ],
      minorPlayed: ['E074_AshTrees'],
      cardStates: { E074_AshTrees: { counters: { fences: 5 } } },
      supplyTokensConsumed: { fence: 1 },
    })

    expect(getOwnOrdinaryFenceBuildLimit(p)).toBe(14)
    expect(getOwnOrdinaryFenceReserveCount(p)).toBe(8)
  })

  it('counts stable reserve after consumed, built, future, lazybones, and farmhand reservations', () => {
    const p = player({
      occupationPlayed: ['E148_Lazybones', 'B085_FarmHand'],
      stableTiles: [{ row: 0, col: 1 }],
      supplyTokensConsumed: { stable: 1 },
      cardStates: {
        E148_Lazybones: { extraData: { reservedActionSpaces: ['grain-seeds'] } },
        B085_FarmHand: { extraData: { position: { row: 1, col: 1 } } },
      },
    })
    const state = {
      players: [p],
      futureMeeples: [{
        id: 'future-stable',
        cardId: 'A089_StablePlanner',
        playerId: p.id,
        round: 6,
        actionId: null,
        resources: { stable: 1 },
      }],
    }

    expect(getAvailableStableSupplyCount(state as never, p)).toBe(0)
    expect(MAX_STABLE_PIECES).toBe(4)
  })
})
