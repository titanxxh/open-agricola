import { describe, it, expect } from 'vitest'
import { buildRoomCostPerUnit } from '../room-payment'
import type { PlayerState, CostModifier } from '../../../../contract/types'

const makePlayer = (modifiers: CostModifier[], houseType: 'wood' | 'clay' | 'stone' = 'clay'): PlayerState => ({
  id: 'p1',
  houseType,
  rooms: 1,
  roomTiles: [], fields: [], stableTiles: [], pastures: [],
  cardStates: {},
  resources: { wood: 0, clay: 0, reed: 0, stone: 0, food: 0, grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0 },
  occupationPlayed: [], minorPlayed: [],
  activeModifiers: modifiers,
} as unknown as PlayerState)

describe('buildRoomCostPerUnit (multi-key trade)', () => {
  it('multi-key trade adds {clay:2,reed:1,wood:1} alongside base {clay:5,reed:2}', () => {
    const player = makePlayer([{
      type: 'trade', cardId: 'D15_ClaySupports', appliesTo: ['construct'],
      from: { wood: 1 }, to: { clay: 3, reed: 1 },
    }])
    const result = buildRoomCostPerUnit(player) as { fees: any[] } | any
    const fees = (result as any).fees ?? [result]
    expect(fees).toEqual(expect.arrayContaining([
      { clay: 5, reed: 2 },
      { clay: 2, reed: 1, wood: 1 },
    ]))
  })

  it('multi-key trade with maxAmount=undefined defaults to perUseLimit (here 1 for base 5C+2R)', () => {
    const player = makePlayer([{
      type: 'trade', cardId: 'D15_ClaySupports', appliesTo: ['construct'],
      from: { wood: 1 }, to: { clay: 3, reed: 1 },
    }])
    const result = buildRoomCostPerUnit(player) as any
    const fees = result.fees ?? [result]
    const tradedOnce = fees.find((f: any) => f.wood === 1)
    expect(tradedOnce).toEqual({ clay: 2, reed: 1, wood: 1 })
  })

  it('single-key trade still works (regression: B109/B155/D117 pattern)', () => {
    const player = makePlayer([{
      type: 'trade', cardId: 'TEST', appliesTo: ['construct'],
      from: { wood: 1 }, to: { clay: 2 },
    }])
    const result = buildRoomCostPerUnit(player) as any
    const fees = result.fees ?? [result]
    expect(fees).toEqual(expect.arrayContaining([
      { clay: 5, reed: 2 },
      { clay: 3, reed: 2, wood: 1 },
      { clay: 1, reed: 2, wood: 2 },
    ]))
  })

  it('multi-key trade does NOT apply when base lacks one of to-keys', () => {
    const player = makePlayer([{
      type: 'trade', cardId: 'TEST', appliesTo: ['construct'],
      from: { wood: 1 }, to: { clay: 3, reed: 1 },
    }], 'wood')
    const result = buildRoomCostPerUnit(player) as any
    const fees = result.fees ?? [result]
    // wood-house base = {wood:5, reed:2}; clay key missing → perUseLimit=0,
    // no transformed fee should be added (only the untouched base remains).
    expect(fees).toEqual([{ wood: 5, reed: 2 }])
  })
})
