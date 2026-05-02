import { describe, expect, it } from 'vitest'
import { canStartFencing } from '../fencing'
import type { GameState, PlayerState } from '../../../game/types'

const fakeState = { actionSpaces: [], players: [] } as unknown as GameState

const createPlayer = (overrides?: Partial<PlayerState>): PlayerState =>
  ({
    id: 'p1', name: 'P1', color: 'red',
    resources: {
      wood: 0, clay: 0, reed: 0, stone: 0, food: 0,
      grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0,
    },
    workers: [], rooms: 2, houseType: 'wood',
    fields: [], roomTiles: [], stableTiles: [],
    improvements: [], minorHand: [], minorPlayed: [],
    occupationHand: [], occupationPlayed: [],
    houseAnimalType: null, houseAnimalCount: 0, stableAnimals: {},
    pastures: [], fenceSegments: [],
    majorEffects: { wellRounds: 0 }, startPlayer: false,
    activeModifiers: [], cardStates: {},
    ...overrides,
  }) as unknown as PlayerState

describe('canStartFencing with costOverride', () => {
  it('returns true when wood + override.wood discount >= 4', () => {
    const player = createPlayer({
      resources: {
        wood: 1, clay: 0, reed: 0, stone: 0, food: 0,
        grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0,
      },
    })
    expect(canStartFencing(fakeState, player)).toBe(false)
    expect(canStartFencing(fakeState, player, { wood: -3 })).toBe(true)
  })

  it('treats undefined override the same as zero override', () => {
    const player = createPlayer({
      resources: {
        wood: 4, clay: 0, reed: 0, stone: 0, food: 0,
        grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0,
      },
    })
    expect(canStartFencing(fakeState, player)).toBe(true)
    expect(canStartFencing(fakeState, player, undefined)).toBe(true)
    expect(canStartFencing(fakeState, player, { wood: 0 })).toBe(true)
  })
})
