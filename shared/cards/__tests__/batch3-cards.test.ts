import { describe, expect, it } from 'vitest'
import {
  getRegisteredCardListeners,
  getMatchingListeners,
  executeCardListener,
} from '../card-listeners'
import type { GameState, PlayerState, ActionSpace } from '../../game/types'

import '../C/C144_ReedRoofRenovator'
import '../B/B100_Clutterer'

// Cards referenced in B100_Clutterer tests — import to register in type registry
import '../B/B146_Illusionist'
import '../A/A105_BarrowPusher'
import '../B/B67_HandTruck'
import '../A/A10_WoodenShed'

const createPlayer = (id = 'p1', name = 'P1'): PlayerState =>
  ({
    id, name, color: id === 'p1' ? 'red' : 'blue',
    resources: {
      wood: 0, clay: 0, reed: 0, stone: 0, food: 0,
      grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0,
    },
    familySize: 2, workersAvailable: 2, rooms: 2, houseType: 'wood',
    fields: [], fences: 0, roomTiles: [], stableTiles: [],
    improvements: [], minorHand: [], minorPlayed: [],
    occupationHand: [], occupationPlayed: [], playedCards: [],
    houseAnimalType: null, houseAnimalCount: 0, stableAnimals: {},
    newbornCount: 0, pastures: [], fenceSegments: [],
    majorEffects: { wellRounds: 0 }, startPlayer: false,
  }) as PlayerState

const createState = (...players: PlayerState[]): GameState =>
  ({
    round: 3, currentPlayerIndex: 0, players,
    actionSpaces: [], log: [], roundStartSnapshot: null,
    roundActionOrder: Array.from({ length: 14 }).map(() => null),
    gameSeed: 1, availableMajorImprovements: [],
    futureMeeples: [], pendingFutureMeeples: [],
    gameOver: false, workPhaseObtainedResources: {},
  }) as GameState

const createSpace = (id: string): ActionSpace =>
  ({
    id, nameKey: `actions.${id}.name`, descriptionKey: `actions.${id}.description`,
    roundAvailable: 1, gainPerRound: {},
    canBeExecutedByPlayer: () => true, execute: () => ({ type: 'ok' }),
    resources: { wood: 0, clay: 0, reed: 0, stone: 0, food: 0, grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0 },
    takenBy: null,
  }) as ActionSpace

const findListener = (id: string) => getRegisteredCardListeners().find(l => l.id === id)

describe('C144_ReedRoofRenovator', () => {
  it('returns gain flow with 1 reed when opponent renovates', () => {
    const listener = findListener('C144-reed-roof-renovator-after-renovate')
    expect(listener).toBeDefined()
    expect(listener!.scope).toBe('opponent')

    const p1 = createPlayer('p1', 'P1')
    p1.occupationPlayed = ['C144_ReedRoofRenovator']
    const p2 = createPlayer('p2', 'P2')
    const state = createState(p1, p2)

    const result = executeCardListener(listener!, {
      state, player: p2, space: createSpace('renovate-house'),
      actionId: 'renovate-house', phase: 'immediatelyAfter',
    } as any)
    expect(result?.flow?.type).toBe('leaf')
    if (result?.flow?.type === 'leaf') {
      expect(result.flow.actionId).toBe('gain')
      expect(result.flow.params).toEqual({ reed: 1 })
      expect(result.flow.sourceCard).toBe('C144_ReedRoofRenovator')
    }
    expect(result?.logKey).toBe('log.cardEffectGain')
    expect(p1.cardStates?.C144_ReedRoofRenovator).toBeUndefined()
    expect(p2.cardStates?.C144_ReedRoofRenovator).toBeUndefined()
  })

  it('matches via getMatchingListeners when opponent renovates', () => {
    const p1 = createPlayer('p1', 'P1')
    p1.occupationPlayed = ['C144_ReedRoofRenovator']
    const p2 = createPlayer('p2', 'P2')
    const state = createState(p1, p2)

    const matched = getMatchingListeners({
      state, player: p2, space: createSpace('renovate-house'),
      actionId: 'renovate-house', phase: 'immediatelyAfter',
    } as any)
    const found = matched.find(m => m.registration.id === 'C144-reed-roof-renovator-after-renovate')
    expect(found).toBeDefined()
    expect(found!.ownerPlayerId).toBe('p1')
  })

  it('does not match when card owner renovates', () => {
    const p1 = createPlayer('p1', 'P1')
    p1.occupationPlayed = ['C144_ReedRoofRenovator']
    const p2 = createPlayer('p2', 'P2')
    const state = createState(p1, p2)

    const matched = getMatchingListeners({
      state, player: p1, space: createSpace('renovate-house'),
      actionId: 'renovate-house', phase: 'immediatelyAfter',
    } as any)
    const found = matched.find(m => m.registration.id === 'C144-reed-roof-renovator-after-renovate')
    expect(found).toBeUndefined()
  })
})

describe('B100_Clutterer', () => {
  it('gives bonus VP when playing occupation with "accumulation" in desc', () => {
    const listener = findListener('B100-clutterer-after-occupation')
    expect(listener).toBeDefined()

    const player = createPlayer()
    player.occupationPlayed = ['B100_Clutterer']
    const state = createState(player)

    // B146_Illusionist has "accumulation" in its desc
    const result = executeCardListener(listener!, {
      state, player, space: createSpace('play-occupation'),
      actionId: 'play-occupation', phase: 'after',
      choice: 'B146_Illusionist',
    } as any)
    expect(result?.flow?.type).toBe('leaf')
    if (result?.flow?.type === 'leaf') {
      expect(result.flow.actionId).toBe('bonus-vp')
    }
  })

  it('does not trigger for occupation without "accumulation" in desc', () => {
    const listener = findListener('B100-clutterer-after-occupation')!
    const player = createPlayer()
    player.occupationPlayed = ['B100_Clutterer']

    const result = executeCardListener(listener, {
      state: createState(player), player, space: createSpace('play-occupation'),
      actionId: 'play-occupation', phase: 'after',
      choice: 'A105_BarrowPusher',
    } as any)
    expect(result).toBeUndefined()
  })

  it('does not trigger when card not played', () => {
    const listener = findListener('B100-clutterer-after-occupation')!
    const player = createPlayer()

    const result = executeCardListener(listener, {
      state: createState(player), player, space: createSpace('play-occupation'),
      actionId: 'play-occupation', phase: 'after',
      choice: 'B146_Illusionist',
    } as any)
    expect(result).toBeUndefined()
  })

  it('gives bonus VP for minor improvement with "accumulation" in desc', () => {
    const listener = findListener('B100-clutterer-after-improvement')
    expect(listener).toBeDefined()

    const player = createPlayer()
    player.occupationPlayed = ['B100_Clutterer']

    const result = executeCardListener(listener!, {
      state: createState(player), player, space: createSpace('improvement-any'),
      actionId: 'improvement-any', phase: 'after',
      choice: 'minor:B67_HandTruck',
    } as any)
    expect(result?.flow?.type).toBe('leaf')
    if (result?.flow?.type === 'leaf') {
      expect(result.flow.actionId).toBe('bonus-vp')
    }
  })

  it('does not trigger for minor without "accumulation"', () => {
    const listener = findListener('B100-clutterer-after-improvement')!
    const player = createPlayer()
    player.occupationPlayed = ['B100_Clutterer']

    const result = executeCardListener(listener, {
      state: createState(player), player, space: createSpace('improvement-any'),
      actionId: 'improvement-any', phase: 'after',
      choice: 'minor:A10_WoodenShed',
    } as any)
    expect(result).toBeUndefined()
  })
})
