import { describe, expect, it } from 'vitest'
import {
  getRegisteredCardListeners,
  executeCardListener,
} from '../card-listeners'
import type { GameState, PlayerState, ActionSpace } from '../../game/types'

import '../B/B36_Bottles'
import { B36_Bottles as B36Card } from '../B/B36_Bottles'

import { setActiveWorkerCount } from '../../game/player'
const CARD_ID = 'B36_Bottles'

const createPlayer = (id = 'p1'): PlayerState =>
  ({
    id, name: 'P1', color: 'red',
    resources: {
      wood: 0, clay: 0, reed: 0, stone: 0, food: 0,
      grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0,
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
    occupationHand: [], occupationPlayed: [],houseAnimalType: null, houseAnimalCount: 0, stableAnimals: {},
    pastures: [], fenceSegments: [],
    majorEffects: { wellRounds: 0 }, startPlayer: false,
    activeModifiers: [], cardStates: {},
  }) as unknown as PlayerState

const createState = (...players: PlayerState[]): GameState =>
  ({
    round: 3, phase: 'work', currentPlayerIndex: 0, players,
    actionSpaces: [], log: [], roundStartSnapshot: null,
    roundActionOrder: Array.from({ length: 14 }).map(() => null),
    gameSeed: 1, availableMajorImprovements: [],
    futureMeeples: [], pendingFutureMeeples: [],
    gameOver: false, workPhaseObtainedResources: {},
  }) as unknown as GameState

const createSpace = (id: string): ActionSpace =>
  ({
    id, nameKey: `actions.${id}.name`, descriptionKey: `actions.${id}.description`,
    roundAvailable: 1, gainPerRound: {},
    canBeExecutedByPlayer: () => true, execute: () => ({ type: 'ok' }),
    resources: { wood: 0, clay: 0, reed: 0, stone: 0, food: 0, grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0 },
    takenBy: [],
  }) as ActionSpace

const findListener = (id: string) => getRegisteredCardListeners().find(l => l.id === id)

describe('B36_Bottles', () => {
  it('card definition has 4 VP and empty base cost', () => {
    expect(B36Card.vp).toBe(4)
    expect(B36Card.cost).toEqual({})
  })

  it('computeCosts sets cost based on family size (2 farmers)', () => {
    const listener = findListener('B36-bottles-compute-costs')!
    expect(listener).toBeDefined()
    const player = createPlayer()
    setActiveWorkerCount(player, 2)
    const state = createState(player)

    const result = executeCardListener(listener, {
      state, player, space: createSpace('minor-improvement'),
      actionId: 'minor-improvement', phase: 'computeCosts',
      cardId: CARD_ID,
    } as any)

    expect(result).toBeDefined()
    expect(result!.costs).toEqual({ clay: 2, food: 2 })
  })

  it('computeCosts scales with 3 farmers', () => {
    const listener = findListener('B36-bottles-compute-costs')!
    const player = createPlayer()
    setActiveWorkerCount(player, 3)
    const state = createState(player)

    const result = executeCardListener(listener, {
      state, player, space: createSpace('minor-improvement'),
      actionId: 'minor-improvement', phase: 'computeCosts',
      cardId: CARD_ID,
    } as any)

    expect(result).toBeDefined()
    expect(result!.costs).toEqual({ clay: 3, food: 3 })
  })

  it('computeCosts scales with 5 farmers', () => {
    const listener = findListener('B36-bottles-compute-costs')!
    const player = createPlayer()
    setActiveWorkerCount(player, 5)
    const state = createState(player)

    const result = executeCardListener(listener, {
      state, player, space: createSpace('minor-improvement'),
      actionId: 'minor-improvement', phase: 'computeCosts',
      cardId: CARD_ID,
    } as any)

    expect(result).toBeDefined()
    expect(result!.costs).toEqual({ clay: 5, food: 5 })
  })

  it('computeCosts does not trigger for a different card', () => {
    const listener = findListener('B36-bottles-compute-costs')!
    const player = createPlayer()
    const state = createState(player)

    const result = executeCardListener(listener, {
      state, player, space: createSpace('minor-improvement'),
      actionId: 'minor-improvement', phase: 'computeCosts',
      cardId: 'SomeOtherCard',
    } as any)

    expect(result).toBeUndefined()
  })
})
