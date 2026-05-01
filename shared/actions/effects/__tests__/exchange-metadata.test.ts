import { describe, it, expect } from 'vitest'
import { getExchangesInWindow, getExchangesByTradeIds } from '../exchange'
import type { PlayerState, Resource } from '../../../game/types'

const createMockPlayer = (overrides: Partial<PlayerState> = {}): PlayerState => ({
  id: 'p1',
  name: 'Player 1',
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
  } as Resource,
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

describe('cookery exchange metadata-driven helpers', () => {
  it('returns Major Fireplace1 anytime trades for player who played it', () => {
    const player = createMockPlayer({ improvements: ['Major_Fireplace1'] })
    const trades = getExchangesInWindow(player, 'anytime')
    // 4 anytime trades (sheep/boar/cattle/vegetable); bake-bread excluded.
    expect(trades.length).toBe(4)
    expect(trades.every((t) => t.sourceId === 'Major_Fireplace1')).toBe(true)
  })

  it('separates bake-bread from anytime for Fireplace', () => {
    const player = createMockPlayer({ improvements: ['Major_Fireplace1'] })
    const bake = getExchangesInWindow(player, 'bake-bread')
    expect(bake.length).toBe(1)
    expect(bake[0]!.from.grain).toBe(1)
    expect(bake[0]!.to.food).toBe(2)
  })

  it('returns empty for player with no cookery cards', () => {
    const player = createMockPlayer({})
    expect(getExchangesInWindow(player, 'anytime')).toHaveLength(0)
    expect(getExchangesInWindow(player, 'harvest')).toHaveLength(0)
    expect(getExchangesInWindow(player, 'bake-bread')).toHaveLength(0)
  })

  it('getExchangesByTradeIds force-includes by sourceId', () => {
    const player = createMockPlayer({ minorPlayed: ['E53_BoarSpear'] })
    // E53 is currently surfaced via anytime window (Sprint 6a kept legacy
    // behaviour). The tradeIds path also resolves the exchange.
    const byId = getExchangesByTradeIds(player, ['E53_BoarSpear'])
    expect(byId).toHaveLength(1)
    expect(byId[0]!.from.boar).toBe(1)
    expect(byId[0]!.to.food).toBe(4)
    expect(byId[0]!.sourceId).toBe('E53_BoarSpear')
  })

  it('Major_CookingHearth2 uses its own sourceId (not inherited from CookingHearth1)', () => {
    const player = createMockPlayer({ improvements: ['Major_CookingHearth2'] })
    const trades = getExchangesInWindow(player, 'anytime')
    expect(trades.length).toBe(4)
    expect(trades.every((t) => t.sourceId === 'Major_CookingHearth2')).toBe(true)
    // Cattle conversion at CookingHearth: 1 cattle -> 4 food (vs Fireplace 3)
    const cattle = trades.find((t) => t.from.cattle === 1)
    expect(cattle?.to.food).toBe(4)
  })
})
