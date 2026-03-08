import { describe, expect, it } from 'vitest'
import {
  getRegisteredCardListeners,
  executeCardListener,
} from '../card-listeners'
import type { GameState, PlayerState, ActionSpace } from '../../game/types'

import '../A/A37_Bucksaw'

const createPlayer = (id = 'p1', name = 'P1'): PlayerState =>
  ({
    id, name, color: 'red',
    resources: {
      wood: 5, clay: 0, reed: 0, stone: 0, food: 0,
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

describe('A37_Bucksaw', () => {
  it('triggers card-choice flow after renovate when player has wood', () => {
    const listener = findListener('A37-bucksaw-after-renovate')
    expect(listener).toBeDefined()
    const player = createPlayer()
    player.minorPlayed = ['A37_Bucksaw']
    const result = executeCardListener(listener!, {
      state: createState(player), player, space: createSpace('renovate-house'),
      actionId: 'renovate-house', phase: 'after',
    } as any)
    expect(result?.flow?.type).toBe('leaf')
    if (result?.flow?.type === 'leaf') {
      expect(result.flow.actionId).toBe('card-choice')
    }
    expect(player.cardStates?.A37_Bucksaw?.counters?.triggerCount).toBe(1)
    expect(player.cardStates?.__pendingChoice__?.extraData).toBeDefined()
  })

  it('does not trigger when no wood', () => {
    const listener = findListener('A37-bucksaw-after-renovate')
    const player = createPlayer()
    player.minorPlayed = ['A37_Bucksaw']
    player.resources.wood = 0
    const result = executeCardListener(listener!, {
      state: createState(player), player, space: createSpace('renovate-house'),
      actionId: 'renovate-house', phase: 'after',
    } as any)
    expect(result).toBeUndefined()
  })

  it('pay choice deducts wood and gives grain + bonusVp', () => {
    const listener = findListener('A37-bucksaw-process-choice')
    expect(listener).toBeDefined()
    const player = createPlayer()
    player.minorPlayed = ['A37_Bucksaw']
    player.cardStates = {
      __pendingChoice__: {
        counters: {},
        extraData: { targetCardId: 'A37_Bucksaw', choiceResult: 'pay' },
      },
    }
    const result = executeCardListener(listener!, {
      state: createState(player), player, space: createSpace('card-choice'),
      actionId: 'card-choice', phase: 'after',
    } as any)
    expect(result?.flow?.type).toBe('leaf')
    if (result?.flow?.type === 'leaf') {
      expect(result.flow.params).toEqual({ grain: 1 })
    }
    expect(player.resources.wood).toBe(4)
    expect(player.cardStates?.A37_Bucksaw?.counters?.bonusVp).toBe(1)
  })

  it('skip choice does nothing', () => {
    const listener = findListener('A37-bucksaw-process-choice')
    const player = createPlayer()
    player.minorPlayed = ['A37_Bucksaw']
    player.cardStates = {
      __pendingChoice__: {
        counters: {},
        extraData: { targetCardId: 'A37_Bucksaw', choiceResult: 'skip' },
      },
    }
    const result = executeCardListener(listener!, {
      state: createState(player), player, space: createSpace('card-choice'),
      actionId: 'card-choice', phase: 'after',
    } as any)
    expect(result).toBeUndefined()
    expect(player.resources.wood).toBe(5)
  })
})
