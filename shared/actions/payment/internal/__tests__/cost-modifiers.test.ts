import { describe, expect, it, vi } from 'vitest'
import {
  applyCostModifiers,
  evaluateStaticConditions,
  evaluateConditions,
  validateComplexCost,
} from '../cost-modifiers'
import { InvalidActionContextError } from '../../../../contract/action-context-error'
import { validateTradeModifier } from '../../declaration-validation'
import type { PlayerState, TradeModifier } from '../../../../contract/types'

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
  it('requires groupId and groupMax to be set together', () => {
    expect(() => validateTradeModifier({
      type: 'trade', cardId: 'X', appliesTo: ['occupation'],
      from: { wood: 1 }, to: { food: 2 },
      groupId: 'g',
    })).toThrow(/groupId.*groupMax/)
    expect(() => validateTradeModifier({
      type: 'trade', cardId: 'X', appliesTo: ['occupation'],
      from: { wood: 1 }, to: { food: 2 },
      groupMax: 1,
    })).toThrow(/groupId.*groupMax/)
  })
  it('requires groupMax to be a positive integer', () => {
    expect(() => validateTradeModifier({
      type: 'trade', cardId: 'X', appliesTo: ['occupation'],
      from: { wood: 1 }, to: { food: 2 },
      groupId: 'g',
      groupMax: 0,
    })).toThrow(/positive integer/)
  })
  it('requires groupMin to be positive and no greater than groupMax', () => {
    const modifier = {
      type: 'trade', cardId: 'X', appliesTo: ['occupation'],
      from: { wood: 1 }, to: { food: 2 },
      groupId: 'g', groupMin: 2, groupMax: 1,
    } as TradeModifier
    expect(() => validateTradeModifier(modifier)).toThrow(/cannot exceed/)
    modifier.groupMin = 0
    expect(() => validateTradeModifier(modifier)).toThrow(/positive integer/)
  })
})

describe('validateComplexCost', () => {
  it.each(['development','production'])('rejects invalid combined costs with a typed error in %s',mode=>{
    vi.stubEnv('NODE_ENV',mode)
    try {
      const effective=applyCostModifiers({fee:{wood:1}},[{type:'trade',cardId:'CUSTOM_Test',appliesTo:['minor-improvement'],from:{food:1},to:{wood:1},scope:'unit',max:1}])
      expect(()=>validateComplexCost(effective)).toThrow(InvalidActionContextError)
      expect(()=>validateComplexCost({nb:1,cards:{type:'Major',list:['Major_Fireplace1']}})).toThrow(InvalidActionContextError)
    }finally {vi.unstubAllEnvs()}
  })

  it('throws when nb and cards both present', () => {
    expect(() => validateComplexCost({
      nb: 3, unitFee: { wood: 5 },
      cards: { type: 'major', list: ['A1'] },
    })).toThrow(/mutually exclusive/)
  })
  it('throws when unit-scoped trade is present but nb is missing', () => {
    expect(() => validateComplexCost({
      trades: [{ from: { wood: 1 }, to: { clay: 2 }, scope: 'unit' }],
    })).toThrow(/nb.*missing/)
  })
  it('does not throw for action-scoped trade with no nb', () => {
    expect(() => validateComplexCost({
      trades: [{ from: {}, to: { wood: 1 }, max: 3, scope: 'action' }],
    })).not.toThrow()
  })
  it('does not throw for unit-scoped trade with nb', () => {
    expect(() => validateComplexCost({
      nb: 3, unitFee: { clay: 5 },
      trades: [{ from: { wood: 1 }, to: { clay: 2 }, scope: 'unit' }],
    })).not.toThrow()
  })
})

describe('applyCostModifiers — scope handling', () => {
  it('removes named resources from fees while preserving unitFee for trade expansion', () => {
    const baseCost = {
      fee: { wood: 1, reed: 2 },
      fees: [{ clay: 3, reed: 4 }, { stone: 5 }],
      unitFee: { wood: 6, reed: 7 },
      nb: 2,
    }
    const result = applyCostModifiers(baseCost, [{
      type: 'remove-resource',
      cardId: 'C014_StrawThatchedRoof',
      appliesTo: ['construct', 'renovation'],
      resources: ['reed'],
    }])

    expect(result).toMatchObject({
      fee: { wood: 1 },
      fees: [{ clay: 3 }, { stone: 5 }],
      unitFee: { wood: 6, reed: 7 },
      costResourceRemovals: [{
        resource: 'reed',
        sourceCard: 'C014_StrawThatchedRoof',
        savedByFee: [4, 0],
      }],
    })
    expect(baseCost.fee.reed).toBe(2)
    expect(baseCost.fees[0]?.reed).toBe(4)
    expect(baseCost.unitFee.reed).toBe(7)
  })

  it('attributes duplicate resource removals independently of modifier order', () => {
    const modifiers = ['Z_card', 'A_card'].map((cardId) => ({
      type: 'remove-resource' as const,
      cardId,
      appliesTo: ['renovation' as const],
      resources: ['reed' as const],
    }))

    expect(applyCostModifiers({ fee: { reed: 1 } }, modifiers).costResourceRemovals)
      .toEqual(applyCostModifiers({ fee: { reed: 1 } }, [...modifiers].reverse()).costResourceRemovals)
    expect(applyCostModifiers({ fee: { reed: 1 } }, modifiers).costResourceRemovals?.[0]?.sourceCard)
      .toBe('A_card')
  })

  it('copies scope to synthesised Trade and validates', () => {
    const result = applyCostModifiers({}, [
      {
        type: 'trade', cardId: 'A123_FrameBuilder', appliesTo: ['construct'],
        from: { wood: 1 }, to: { clay: 2 },
        scope: 'unit',
        conditions: { houseTypeClay: 1 },
      },
    ])
    expect(result.trades?.[0]?.scope).toBe('unit')
    expect(result.trades?.[0]?.max).toBeUndefined()
  })
  it('applies `?? 1` default only for action-scope trades with undefined max', () => {
    const result = applyCostModifiers({}, [
      {
        type: 'trade', cardId: 'B145_BrushwoodCollector', appliesTo: ['renovation'],
        from: { wood: 1 }, to: { reed: 1 },
      },
    ])
    expect(result.trades?.[0]?.max).toBe(1)
  })
  it('preserves explicit max regardless of scope', () => {
    const result = applyCostModifiers({}, [
      {
        type: 'trade', cardId: 'A088_HedgeKeeper', appliesTo: ['fencing'],
        from: {}, to: { wood: 1 }, max: 3, scope: 'action',
      },
    ])
    expect(result.trades?.[0]?.max).toBe(3)
  })
  it('copies grouped-use bounds to synthesised Trade', () => {
    const result = applyCostModifiers({}, [
      {
        type: 'trade', cardId: 'E060_WorkingGloves', appliesTo: ['occupation'],
        from: { wood: 1 }, to: { food: 2 }, max: 1,
        groupId: 'E060_WorkingGloves:occupation-food-replacement',
        groupMin: 1,
        groupMax: 1,
      },
    ])
    expect(result.trades?.[0]?.groupId).toBe('E060_WorkingGloves:occupation-food-replacement')
    expect(result.trades?.[0]?.groupMin).toBe(1)
    expect(result.trades?.[0]?.groupMax).toBe(1)
  })
  it('throws via validateTradeModifier on scope:unit + minNumRooms', () => {
    expect(() => applyCostModifiers({}, [
      {
        type: 'trade', cardId: 'X', appliesTo: ['construct'],
        from: { wood: 1 }, to: { clay: 2 },
        scope: 'unit',
        conditions: { minNumRooms: 2 },
      } as TradeModifier,
    ])).toThrow(/minNumRooms/)
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
