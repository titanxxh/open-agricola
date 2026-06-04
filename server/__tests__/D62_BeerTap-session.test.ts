import { describe, expect, it } from 'vitest'
import { D62_BeerTap } from '../../shared/cards/D/D62_BeerTap'
import { D62_BeerTap_impl } from '../../shared/cards/D/D62_BeerTap'
import { getExchangesInWindow } from '../../shared/actions/effects/exchange'
import type { PlayerState, Resource } from '../../shared/contract/types'

const CARD_ID = 'D62_BeerTap'

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

describe('D62_BeerTap — metadata exchange', () => {
  it('declares 3 harvest exchange tiers, all sharing sourceId for sourceId-level cap', () => {
    const exchanges = D62_BeerTap.exchanges ?? []
    expect(exchanges).toHaveLength(3)
    expect(exchanges.every((ex) => ex.sourceId === CARD_ID)).toBe(true)
    expect(exchanges.every((ex) => ex.max === 1)).toBe(true)
    expect(exchanges.every((ex) => (ex.triggers ?? []).includes('harvest'))).toBe(true)
    // 2/3/4 grain -> 3/6/9 food
    expect(exchanges[0]!.from.grain).toBe(2)
    expect(exchanges[0]!.to.food).toBe(3)
    expect(exchanges[1]!.from.grain).toBe(3)
    expect(exchanges[1]!.to.food).toBe(6)
    expect(exchanges[2]!.from.grain).toBe(4)
    expect(exchanges[2]!.to.food).toBe(9)
  })

  it('all 3 tiers visible in harvest window', () => {
    const player = makePlayer({ minorPlayed: [CARD_ID] })
    const trades = getExchangesInWindow(player, 'harvest')
    expect(trades).toHaveLength(3)
    expect(trades.every((t) => t.sourceId === CARD_ID)).toBe(true)
  })

  it('not visible in anytime window (harvest-only)', () => {
    const player = makePlayer({ minorPlayed: [CARD_ID] })
    expect(getExchangesInWindow(player, 'anytime')).toHaveLength(0)
  })

  it('onBuy grants +2 food via gainLeaf', () => {
    const flow = D62_BeerTap_impl.effect.onBuy?.(null as never, null as never)
    expect(flow).toBeTruthy()
    expect(flow?.type).toBe('leaf')
    if (flow?.type !== 'leaf') return
    expect(flow.actionId).toBe('gain')
    expect(flow.params).toEqual({ food: 2 })
  })
})
