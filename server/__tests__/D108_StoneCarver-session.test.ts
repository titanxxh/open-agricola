import { describe, expect, it } from 'vitest'
import { D108_StoneCarver } from '../../shared/cards/D/D108_StoneCarver'
import { getExchangesInWindow } from '../../shared/actions/effects/exchange'
import type { PlayerState, Resource } from '../../shared/contract/types'

const CARD_ID = 'D108_StoneCarver'

const makePlayer = (overrides: Partial<PlayerState> = {}): PlayerState => ({
  id: 'p1', name: 'P1', color: 'red',
  resources: {
    wood: 0, clay: 0, reed: 0, stone: 0, food: 0, grain: 0,
    vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0,
  } as Resource,
  rooms: 2, houseType: 'wood', fields: [], fences: 0,
  roomTiles: [], stableTiles: [],
  improvements: [], minorHand: [], minorPlayed: [],
  occupationHand: [], occupationPlayed: [],
  houseAnimalType: null, houseAnimalCount: 0, stableAnimals: {},
  pastures: [], fenceSegments: [],
  majorEffects: { wellRounds: 0 },
  startPlayer: false, activeModifiers: [], cardStates: {},
  ...overrides,
})

describe('D108_StoneCarver — metadata exchange', () => {
  it('declares a single harvest exchange (1 stone -> 3 food, max:1)', () => {
    const exchanges = D108_StoneCarver.exchanges ?? []
    expect(exchanges).toHaveLength(1)
    const ex = exchanges[0]!
    expect(ex.from.stone).toBe(1)
    expect(ex.to.food).toBe(3)
    expect(ex.max).toBe(1)
    expect(ex.sourceId).toBe(CARD_ID)
    expect(ex.triggers).toEqual(['harvest'])
  })

  it('appears in harvest window for player who played it', () => {
    const player = makePlayer({ occupationPlayed: [CARD_ID] })
    const trades = getExchangesInWindow(player, 'harvest')
    expect(trades).toHaveLength(1)
    expect(trades[0]!.sourceId).toBe(CARD_ID)
  })

  it('not visible in anytime window (harvest-only)', () => {
    const player = makePlayer({ occupationPlayed: [CARD_ID] })
    expect(getExchangesInWindow(player, 'anytime')).toHaveLength(0)
  })
})
