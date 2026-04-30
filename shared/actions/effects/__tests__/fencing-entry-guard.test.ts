import { describe, expect, it } from 'vitest'
import { canStartFencing, maxFences } from '../fencing'
import type { GameState, PlayerState } from '../../../game/types'

import '../../../cards/E/E16_BriarHedge'

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

describe('canStartFencing entry-guard', () => {
  it('returns false when no fence-discount cards and 0 wood', () => {
    const player = createPlayer({ resources: {
      wood: 0, clay: 0, reed: 0, stone: 0, food: 0,
      grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0,
    } })
    expect(canStartFencing(fakeState, player)).toBe(false)
  })

  it('returns true when player has E16 BriarHedge and 0 wood (border-edge fences are free)', () => {
    const player = createPlayer({
      resources: {
        wood: 0, clay: 0, reed: 0, stone: 0, food: 0,
        grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0,
      },
      minorPlayed: ['E16_BriarHedge'],
    })
    expect(canStartFencing(fakeState, player)).toBe(true)
  })

  it('returns false when fence cap is already reached even with E16', () => {
    const fenceSegments = Array.from({ length: maxFences - 1 }, (_, i) => ({
      edge: `H-0-${i}`, type: 'fence' as const,
    }))
    const player = createPlayer({
      resources: {
        wood: 99, clay: 0, reed: 0, stone: 0, food: 0,
        grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0,
      },
      minorPlayed: ['E16_BriarHedge'],
      fenceSegments,
    })
    expect(canStartFencing(fakeState, player)).toBe(false)
  })

  it('returns true when player has 4+ wood and no card discount', () => {
    const player = createPlayer({ resources: {
      wood: 4, clay: 0, reed: 0, stone: 0, food: 0,
      grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0,
    } })
    expect(canStartFencing(fakeState, player)).toBe(true)
  })
})
