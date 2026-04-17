import { describe, expect, it } from 'vitest'
import { getPlayerBakeRates, hasAnyBakingImprovement } from '../helpers/exchange-registry'
import { canBakeBread, bakeBread } from '../../actions/effects/bake-bread'
import type { PlayerState } from '../../game/types'

import '../E/E63_IronOven'
import '../E/E64_SimpleOven'

const createPlayer = (overrides?: Partial<PlayerState>): PlayerState =>
  ({
    id: 'p1', name: 'P1', color: 'red',
    resources: {
      wood: 0, clay: 0, reed: 0, stone: 0, food: 0,
      grain: 3, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0,
    },
    workers: [
      { id: '1', isActive: true, isNewborn: false },
      { id: '2', isActive: true, isNewborn: false },
      { id: '3', isActive: false, isNewborn: false },
      { id: '4', isActive: false, isNewborn: false },
      { id: '5', isActive: false, isNewborn: false },
    ],
    rooms: 2, houseType: 'wood',
    fields: [], fences: 0, roomTiles: [], stableTiles: [],
    improvements: [], minorHand: [], minorPlayed: [],
    occupationHand: [], occupationPlayed: [], playedCards: [],
    houseAnimalType: null, houseAnimalCount: 0, stableAnimals: {},
    pastures: [], fenceSegments: [],
    majorEffects: { wellRounds: 0 }, startPlayer: false,
    activeModifiers: [], cardStates: {},
    ...overrides,
  }) as PlayerState

describe('getPlayerBakeRates', () => {
  it('returns Major bake rates from improvements', () => {
    const player = createPlayer({ improvements: ['Major_ClayOven'] })
    const rates = getPlayerBakeRates(player)
    expect(rates.length).toBe(1)
    expect(rates[0]).toMatchObject({ cardId: 'Major_ClayOven', rate: 5, max: 1 })
  })

  it('returns Minor bake rates from minorPlayed', () => {
    const player = createPlayer({ minorPlayed: ['E63_IronOven'] })
    const rates = getPlayerBakeRates(player)
    expect(rates.length).toBe(1)
    expect(rates[0]).toMatchObject({ cardId: 'E63_IronOven', rate: 6, max: 1 })
  })

  it('returns both Major and Minor rates', () => {
    const player = createPlayer({
      improvements: ['Major_Fireplace1'],
      minorPlayed: ['E64_SimpleOven'],
    })
    const rates = getPlayerBakeRates(player)
    expect(rates.length).toBe(2)
    expect(rates.find((r) => r.cardId === 'Major_Fireplace1')).toMatchObject({ rate: 2 })
    expect(rates.find((r) => r.cardId === 'E64_SimpleOven')).toMatchObject({ rate: 3, max: 1 })
  })

  it('returns empty for player with no baking improvements', () => {
    const player = createPlayer()
    expect(getPlayerBakeRates(player)).toEqual([])
  })
})

describe('hasAnyBakingImprovement', () => {
  it('true with Major baking improvement', () => {
    expect(hasAnyBakingImprovement(createPlayer({ improvements: ['Major_StoneOven'] }))).toBe(true)
  })

  it('true with Minor baking improvement', () => {
    expect(hasAnyBakingImprovement(createPlayer({ minorPlayed: ['E63_IronOven'] }))).toBe(true)
  })

  it('false without any baking improvement', () => {
    expect(hasAnyBakingImprovement(createPlayer())).toBe(false)
  })
})

describe('canBakeBread', () => {
  it('true when player has grain and matching card', () => {
    const player = createPlayer({ minorPlayed: ['E63_IronOven'] })
    expect(canBakeBread(player, 'E63_IronOven')).toBe(true)
  })

  it('false when no grain', () => {
    const player = createPlayer({ minorPlayed: ['E63_IronOven'] })
    player.resources.grain = 0
    expect(canBakeBread(player, 'E63_IronOven')).toBe(false)
  })

  it('false when card not played', () => {
    const player = createPlayer()
    expect(canBakeBread(player, 'E63_IronOven')).toBe(false)
  })
})

describe('bakeBread with Minor oven', () => {
  it('E63 bakes 1 grain → 6 food', () => {
    const player = createPlayer({ minorPlayed: ['E63_IronOven'] })
    const result = bakeBread(player, 'E63_IronOven', 1)
    expect(result.type).toBe('ok')
    expect(player.resources.grain).toBe(2)
    expect(player.resources.food).toBe(6)
  })

  it('E64 bakes 1 grain → 3 food', () => {
    const player = createPlayer({ minorPlayed: ['E64_SimpleOven'] })
    const result = bakeBread(player, 'E64_SimpleOven', 1)
    expect(result.type).toBe('ok')
    expect(player.resources.grain).toBe(2)
    expect(player.resources.food).toBe(3)
  })

  it('Major still works after migration', () => {
    const player = createPlayer({ improvements: ['Major_ClayOven'] })
    const result = bakeBread(player, 'Major_ClayOven', 1)
    expect(result.type).toBe('ok')
    expect(player.resources.grain).toBe(2)
    expect(player.resources.food).toBe(5)
  })
})
