import { describe, expect, it } from 'vitest'
import {
  getRegisteredCardListeners,
  executeCardListener,
} from '../card-listeners'
import type { GameState, PlayerState, ActionSpace } from '../../game/types'

import '../D/D26_CarpentersYard'

const CARD_ID = 'D26_CarpentersYard'

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
    improvements: [], minorHand: [], minorPlayed: [CARD_ID],
    occupationHand: [], occupationPlayed: [],houseAnimalType: null, houseAnimalCount: 0, stableAnimals: {},
    pastures: [], fenceSegments: [],
    majorEffects: { wellRounds: 0 }, startPlayer: false,
    activeModifiers: [], cardStates: {},
  }) as unknown as PlayerState

const createSpace = (id: string, overrides?: Partial<ActionSpace>): ActionSpace =>
  ({
    id, nameKey: `actions.${id}.name`, descriptionKey: `actions.${id}.description`,
    roundAvailable: 1, gainPerRound: {},
    canBeExecutedByPlayer: () => true, execute: () => ({ type: 'ok' }),
    resources: { wood: 0, clay: 0, reed: 0, stone: 0, food: 0, grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0 },
    takenBy: [],
    ...overrides,
  }) as ActionSpace

const createState = (...players: PlayerState[]): GameState =>
  ({
    round: 5, phase: 'work', currentPlayerIndex: 0, players,
    actionSpaces: [createSpace('major-improvement')],
    log: [], roundStartSnapshot: null,
    roundActionOrder: Array.from({ length: 14 }).map(() => null),
    gameSeed: 1, availableMajorImprovements: ['Major_Well', 'Major_Joinery'],
    futureMeeples: [], pendingFutureMeeples: [],
    gameOver: false, workPhaseObtainedResources: {},
  }) as unknown as GameState

const findListener = (id: string) =>
  getRegisteredCardListeners().find((l) => l.id === id)

describe('D26_CarpentersYard', () => {
  it('listener triggers after playing Major_Well, offering Major_Joinery', () => {
    const listener = findListener('D26-carpenters-yard-immediately-after-improvement')
    expect(listener).toBeDefined()
    const player = createPlayer()
    const state = createState(player)
    const result = executeCardListener(listener!, {
      state,
      player,
      space: createSpace('major-improvement'),
      actionId: 'improvement-any',
      phase: 'immediatelyAfter',
      cardId: 'Major_Well',
      trueAction: true,
    })
    expect(result).toBeDefined()
    const flow = (result as any).flow
    expect(flow.type).toBe('seq')
    expect(flow.optional).toBe(true)
    expect(flow.children[0].actionId).toBe('improvement-any')
    expect(flow.children[0].params.allowedPurchases).toEqual(['Major_Joinery'])
  })

  it('listener triggers after playing Major_Joinery, offering Major_Well', () => {
    const listener = findListener('D26-carpenters-yard-immediately-after-improvement')
    const player = createPlayer()
    const state = createState(player)
    const result = executeCardListener(listener!, {
      state,
      player,
      space: createSpace('major-improvement'),
      actionId: 'improvement-any',
      phase: 'immediatelyAfter',
      cardId: 'Major_Joinery',
      trueAction: true,
    })
    expect(result).toBeDefined()
    const flow = (result as any).flow
    expect(flow.children[0].params.allowedPurchases).toEqual(['Major_Well'])
  })

  it('does not trigger for non-allowed cards', () => {
    const listener = findListener('D26-carpenters-yard-immediately-after-improvement')
    const player = createPlayer()
    const state = createState(player)
    const result = executeCardListener(listener!, {
      state,
      player,
      space: createSpace('major-improvement'),
      actionId: 'improvement-any',
      phase: 'immediatelyAfter',
      cardId: 'Major_ClayOven',
      trueAction: true,
    })
    expect(result).toBeUndefined()
  })

  it('does not trigger when other card is not available', () => {
    const listener = findListener('D26-carpenters-yard-immediately-after-improvement')
    const player = createPlayer()
    const state = createState(player)
    state.availableMajorImprovements = ['Major_Well'] // Joinery not available
    const result = executeCardListener(listener!, {
      state,
      player,
      space: createSpace('major-improvement'),
      actionId: 'improvement-any',
      phase: 'immediatelyAfter',
      cardId: 'Major_Well',
      trueAction: true,
    })
    expect(result).toBeUndefined()
  })

  it('does not trigger when trueAction is false', () => {
    const listener = findListener('D26-carpenters-yard-immediately-after-improvement')
    const player = createPlayer()
    const state = createState(player)
    const result = executeCardListener(listener!, {
      state,
      player,
      space: createSpace('major-improvement'),
      actionId: 'improvement-any',
      phase: 'immediatelyAfter',
      cardId: 'Major_Well',
      trueAction: false,
    })
    expect(result).toBeUndefined()
  })
})
