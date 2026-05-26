import { describe, expect, it } from 'vitest'
import '../../../cards/B/B38_FutureBuildingSite'
import { canStartFencing, maxFences } from '../fencing'
import { getAllTilePositions, positionKey } from '../../../domain/farm'
import type { FarmTilePosition, GameState, PlayerState } from '../../../contract/types'

import '../../../cards/E/E16_BriarHedge'

const fakeState = { actionSpaces: [], players: [] } as unknown as GameState

const b38LockedAdjacentRooms: FarmTilePosition[] = [
  { row: 0, col: 0 },
  { row: 0, col: 1 },
  { row: 1, col: 2 },
  { row: 2, col: 0 },
  { row: 2, col: 1 },
]

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

  it('returns true when override.wood discount allows free fences (simulates dispatcher listener output)', () => {
    const player = createPlayer({
      resources: {
        wood: 0, clay: 0, reed: 0, stone: 0, food: 0,
        grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0,
      },
      minorPlayed: ['E16_BriarHedge'],
    })
    expect(canStartFencing(fakeState, player, { wood: -4 })).toBe(true)
  })

  it('returns false when fence cap is already reached even with override discount', () => {
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
    expect(canStartFencing(fakeState, player, { wood: -4 })).toBe(false)
  })

  it('returns true when player has 4+ wood and no card discount', () => {
    const player = createPlayer({ resources: {
      wood: 4, clay: 0, reed: 0, stone: 0, food: 0,
      grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0,
    } })
    expect(canStartFencing(fakeState, player)).toBe(true)
  })

  it('returns false when policy and locked tiles leave no legal fence commit', () => {
    const roomTiles = [
      { row: 1, col: 0 },
      { row: 1, col: 1 },
    ]
    const occupiedKeys = new Set([
      ...roomTiles.map(positionKey),
      ...b38LockedAdjacentRooms.map(positionKey),
      '0-4',
    ])
    const player = createPlayer({
      resources: {
        wood: 0, clay: 0, reed: 0, stone: 0, food: 0,
        grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0,
      },
      roomTiles,
      fields: getAllTilePositions()
        .filter((tile) => !occupiedKeys.has(positionKey(tile)))
        .map((tile) => ({ ...tile, stacks: [] })),
      minorPlayed: ['B38_FutureBuildingSite'],
      cardStates: {
        B38_FutureBuildingSite: { extraData: { locked: b38LockedAdjacentRooms } },
      },
    })
    const state = { actionSpaces: [], players: [player] } as unknown as GameState

    expect(
      canStartFencing(state, player, undefined, {
        fencePolicy: {
          segmentBounds: { total: { min: 6, max: 6 } },
          newPastureBounds: {
            count: { min: 1, max: 1 },
            totalSize: { min: 2, max: 2 },
          },
          costPolicy: { fence: { wood: 0 } },
        },
      }),
    ).toBe(false)
  })

  it('returns false for costPolicy-only policy when the board has no legal fence commit', () => {
    const roomTiles = [
      { row: 1, col: 0 },
      { row: 1, col: 1 },
    ]
    const roomKeys = new Set(roomTiles.map(positionKey))
    const player = createPlayer({
      resources: {
        wood: 10, clay: 0, reed: 0, stone: 0, food: 0,
        grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0,
      },
      roomTiles,
      fields: getAllTilePositions()
        .filter((tile) => !roomKeys.has(positionKey(tile)))
        .map((tile) => ({ ...tile, stacks: [] })),
    })
    const state = { actionSpaces: [], players: [player] } as unknown as GameState

    expect(
      canStartFencing(state, player, undefined, {
        fencePolicy: {
          costPolicy: { fence: { wood: 1 } },
        },
      }),
    ).toBe(false)
  })
})
