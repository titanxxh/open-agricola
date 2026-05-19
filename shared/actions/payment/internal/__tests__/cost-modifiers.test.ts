import { describe, expect, it } from 'vitest'
import { evaluateStaticConditions, evaluateConditions, validateTradeModifier } from '../cost-modifiers'
import type { PlayerState } from '../../../../contract/types'

const mkPlayer = (overrides: Partial<PlayerState> = {}): PlayerState => ({
  id: 'p1', name: 'P1', color: 'red',
  resources: { wood: 0, clay: 0, reed: 0, stone: 0, food: 0, grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0 },
  workers: [], rooms: 1, houseType: 'wood', fields: [], roomTiles: [], stableTiles: [],
  improvements: [], minorHand: [], minorPlayed: [], occupationHand: [], occupationPlayed: [],
  extraOccupationsFromCards: [], playedCards: [],
  houseAnimalType: null, houseAnimalCount: 0, stableAnimals: {}, pastures: [], fenceSegments: [],
  majorEffects: { wellRounds: 0 }, startPlayer: false, activeModifiers: [], cardStates: {},
  stats: {} as never,
  ...overrides,
})

describe('evaluateStaticConditions', () => {
  it('returns true for undefined conditions', () => {
    expect(evaluateStaticConditions(mkPlayer(), undefined)).toBe(true)
  })
  it('returns true when minNumRooms is the only condition (static layer ignores it)', () => {
    expect(evaluateStaticConditions(mkPlayer({ rooms: 1 }), { minNumRooms: 5 })).toBe(true)
  })
  it('filters on houseTypeWood when player has clay house', () => {
    expect(evaluateStaticConditions(mkPlayer({ houseType: 'clay' }), { houseTypeWood: 1 })).toBe(false)
  })
  it('passes when houseTypeClay matches', () => {
    expect(evaluateStaticConditions(mkPlayer({ houseType: 'clay' }), { houseTypeClay: 1 })).toBe(true)
  })
})

describe('validateTradeModifier', () => {
  it('throws when scope:unit carries minNumRooms condition', () => {
    expect(() => validateTradeModifier({
      type: 'trade', cardId: 'X', appliesTo: ['construct'],
      from: { wood: 1 }, to: { clay: 2 },
      scope: 'unit',
      conditions: { minNumRooms: 2 },
    })).toThrow(/minNumRooms/)
  })
  it('allows scope:unit with only houseType conditions', () => {
    expect(() => validateTradeModifier({
      type: 'trade', cardId: 'X', appliesTo: ['construct'],
      from: { wood: 1 }, to: { clay: 2 },
      scope: 'unit',
      conditions: { houseTypeClay: 1 },
    })).not.toThrow()
  })
  it('allows scope:action with any conditions including minNumRooms', () => {
    expect(() => validateTradeModifier({
      type: 'trade', cardId: 'X', appliesTo: ['fencing'],
      from: {}, to: { wood: 1 }, max: 3,
      scope: 'action',
      conditions: { minNumRooms: 2 },
    })).not.toThrow()
  })
})

describe('evaluateConditions (nb-aware)', () => {
  it('uses nb for minNumRooms check when nb is provided', () => {
    expect(evaluateConditions(mkPlayer({ rooms: 1 }), { minNumRooms: 2 }, 2)).toBe(true)
    expect(evaluateConditions(mkPlayer({ rooms: 1 }), { minNumRooms: 2 }, 1)).toBe(false)
  })
  it('falls back to player.rooms when nb is omitted', () => {
    expect(evaluateConditions(mkPlayer({ rooms: 2 }), { minNumRooms: 2 })).toBe(true)
    expect(evaluateConditions(mkPlayer({ rooms: 1 }), { minNumRooms: 2 })).toBe(false)
  })
  it('combines static + nb checks', () => {
    expect(evaluateConditions(mkPlayer({ rooms: 5, houseType: 'wood' }), { minNumRooms: 5, houseTypeWood: 1 }, 5)).toBe(true)
    expect(evaluateConditions(mkPlayer({ rooms: 5, houseType: 'clay' }), { minNumRooms: 5, houseTypeWood: 1 }, 5)).toBe(false)
  })
})
