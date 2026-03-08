import { describe, expect, it } from 'vitest'
import {
  getRegisteredCardListeners,
  executeCardListener,
} from '../card-listeners'
import type { GameState, PlayerState, ActionSpace } from '../../game/types'

import '../D/D152_Patron'
import '../D/D49_Bookshelf'
import '../E/E101_Blighter'

const createPlayer = (id = 'p1', name = 'P1'): PlayerState =>
  ({
    id, name, color: 'red',
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

describe('D152_Patron', () => {
  it('returns gain flow with 2 food before play-occupation', () => {
    const listener = findListener('D152-patron-before-occupation')
    expect(listener).toBeDefined()
    const player = createPlayer()
    player.occupationPlayed = ['D152_Patron']
    const result = executeCardListener(listener!, {
      state: createState(player), player, space: createSpace('play-occupation'),
      actionId: 'play-occupation', phase: 'before',
    } as any)
    expect(result?.flow?.type).toBe('leaf')
    if (result?.flow?.type === 'leaf') {
      expect(result.flow.params).toEqual({ food: 2 })
    }
    expect(player.cardStates?.D152_Patron?.counters?.triggerCount).toBe(1)
  })

  it('isDoable returns true', () => {
    const listener = findListener('D152-patron-isdoable-occupation')
    expect(listener).toBeDefined()
    const player = createPlayer()
    player.occupationPlayed = ['D152_Patron']
    const result = executeCardListener(listener!, {
      state: createState(player), player, space: createSpace('play-occupation'),
      actionId: 'play-occupation', phase: 'isDoable',
    } as any)
    expect(result?.doable).toBe(true)
  })
})

describe('D49_Bookshelf', () => {
  it('returns gain flow with 3 food before play-occupation', () => {
    const listener = findListener('D49-bookshelf-before-occupation')
    expect(listener).toBeDefined()
    const player = createPlayer()
    player.occupationPlayed = ['D49_Bookshelf']
    const result = executeCardListener(listener!, {
      state: createState(player), player, space: createSpace('play-occupation'),
      actionId: 'play-occupation', phase: 'before',
    } as any)
    expect(result?.flow?.type).toBe('leaf')
    if (result?.flow?.type === 'leaf') {
      expect(result.flow.params).toEqual({ food: 3 })
    }
    expect(player.cardStates?.D49_Bookshelf?.counters?.triggerCount).toBe(1)
  })
})

describe('E101_Blighter', () => {
  it('triggers before play-occupation and logs block', () => {
    const listener = findListener('E101-blighter-before-occupation')
    expect(listener).toBeDefined()
    const player = createPlayer()
    player.occupationPlayed = ['E101_Blighter']
    const result = executeCardListener(listener!, {
      state: createState(player), player, space: createSpace('play-occupation'),
      actionId: 'play-occupation', phase: 'before',
    } as any)
    expect(result?.logKey).toBe('log.cardEffectBlock')
    expect(player.cardStates?.E101_Blighter?.counters?.triggerCount).toBe(1)
  })

  it('does not trigger when card not played', () => {
    const listener = findListener('E101-blighter-before-occupation')
    const player = createPlayer()
    const result = executeCardListener(listener!, {
      state: createState(player), player, space: createSpace('play-occupation'),
      actionId: 'play-occupation', phase: 'before',
    } as any)
    expect(result).toBeUndefined()
  })
})
