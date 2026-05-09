import { describe, expect, it } from 'vitest'
import { meetsCardPrerequisites } from '../../helpers/prerequisites'
import type { GameState, PlayerState, Field } from '../../../contract/types'

import '../D7_Trident'
import '../D8_FernSeeds'
import '../D39_TruffleSlicer'
import '../D53_TeaHouse'
import '../D58_Gritter'

import { D7_Trident } from '../../../cards-display/D/D7_Trident'
import { D8_FernSeeds } from '../../../cards-display/D/D8_FernSeeds'
import { D39_TruffleSlicer } from '../../../cards-display/D/D39_TruffleSlicer'
import { D53_TeaHouse } from '../../../cards-display/D/D53_TeaHouse'
import { D58_Gritter } from '../../../cards-display/D/D58_Gritter'

const emptyResources = {
  wood: 0, clay: 0, reed: 0, stone: 0, food: 0,
  grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0,
} as const

const createPlayer = (fields: Field[] = []): PlayerState =>
  ({
    id: 'p1', name: 'P1', color: 'red',
    resources: { ...emptyResources },
    workers: [
      { id: '1', isActive: true, isNewborn: false },
      { id: '2', isActive: true, isNewborn: false },
    ],
    rooms: 2, houseType: 'wood',
    fields, fences: 0, roomTiles: [], stableTiles: [],
    improvements: [], minorHand: [], minorPlayed: [],
    occupationHand: [], occupationPlayed: [],
    houseAnimalType: null, houseAnimalCount: 0, stableAnimals: {},
    pastures: [], fenceSegments: [],
    majorEffects: { wellRounds: 0 }, startPlayer: false,
  }) as unknown as PlayerState

const createState = (round: number, player: PlayerState): GameState =>
  ({
    round, currentPlayerIndex: 0, players: [player],
    actionSpaces: [],
    log: [], roundStartSnapshot: null,
    roundActionOrder: Array.from({ length: 14 }).map(() => null),
    gameSeed: 1, availableMajorImprovements: [],
    futureMeeples: [], pendingFutureMeeples: [],
    gameOver: false, workPhaseObtainedResources: {},
  }) as unknown as GameState

const fieldEmpty = (row: number, col: number): Field =>
  ({ stacks: [], row, col })

const fieldGrain = (row: number, col: number, remaining = 3): Field =>
  ({ stacks: [{ kind: 'grain', remaining }], row, col })

const fieldVeg = (row: number, col: number, remaining = 2): Field =>
  ({ stacks: [{ kind: 'vegetable', remaining }], row, col })

describe('D7 Trident — playable only on rounds 3, 6, 9, 12', () => {
  it.each([
    { round: 1, expected: false },
    { round: 2, expected: false },
    { round: 3, expected: true },
    { round: 4, expected: false },
    { round: 6, expected: true },
    { round: 9, expected: true },
    { round: 12, expected: true },
    { round: 13, expected: false },
  ])('round $round → meetsCardPrerequisites=$expected', ({ round, expected }) => {
    const player = createPlayer()
    const state = createState(round, player)
    expect(meetsCardPrerequisites(player, D7_Trident, round, state)).toBe(expected)
  })
})

describe('D8 FernSeeds — needs >=1 empty and >=2 planted fields', () => {
  it('0 fields: not playable', () => {
    const player = createPlayer([])
    const state = createState(1, player)
    expect(meetsCardPrerequisites(player, D8_FernSeeds, 1, state)).toBe(false)
  })

  it('1 empty + 1 planted: not playable (only 1 planted)', () => {
    const player = createPlayer([
      fieldGrain(0, 0),
      fieldEmpty(0, 1),
    ])
    const state = createState(1, player)
    expect(meetsCardPrerequisites(player, D8_FernSeeds, 1, state)).toBe(false)
  })

  it('1 empty + 2 planted: playable', () => {
    const player = createPlayer([
      fieldGrain(0, 0),
      fieldVeg(0, 1),
      fieldEmpty(0, 2),
    ])
    const state = createState(1, player)
    expect(meetsCardPrerequisites(player, D8_FernSeeds, 1, state)).toBe(true)
  })

  it('0 empty + 3 planted: not playable (no empty)', () => {
    const player = createPlayer([
      fieldGrain(0, 0),
      fieldGrain(0, 1),
      fieldVeg(0, 2),
    ])
    const state = createState(1, player)
    expect(meetsCardPrerequisites(player, D8_FernSeeds, 1, state)).toBe(false)
  })
})

describe('D39 TruffleSlicer — round >= 8', () => {
  it.each([
    { round: 1, expected: false },
    { round: 7, expected: false },
    { round: 8, expected: true },
    { round: 12, expected: true },
  ])('round $round → $expected', ({ round, expected }) => {
    const player = createPlayer()
    const state = createState(round, player)
    expect(meetsCardPrerequisites(player, D39_TruffleSlicer, round, state)).toBe(expected)
  })
})

describe('D53 TeaHouse — round >= 6', () => {
  it.each([
    { round: 5, expected: false },
    { round: 6, expected: true },
  ])('round $round → $expected', ({ round, expected }) => {
    const player = createPlayer()
    const state = createState(round, player)
    expect(meetsCardPrerequisites(player, D53_TeaHouse, round, state)).toBe(expected)
  })
})

describe('D58 Gritter — round >= 5', () => {
  it.each([
    { round: 4, expected: false },
    { round: 5, expected: true },
  ])('round $round → $expected', ({ round, expected }) => {
    const player = createPlayer()
    const state = createState(round, player)
    expect(meetsCardPrerequisites(player, D58_Gritter, round, state)).toBe(expected)
  })
})
