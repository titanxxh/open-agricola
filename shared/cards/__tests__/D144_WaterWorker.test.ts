import { describe, expect, it } from 'vitest'
import { getRegisteredCardListeners, executeCardListener } from '../card-listeners'
import type { GameState, PlayerState, ActionSpace , ActionFlow } from '../../game/types'

import '../D/D144_WaterWorker'
import type { CardListenerContext } from '../card-listeners'

const CARD_ID = 'D144_WaterWorker'

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
    occupationHand: [], occupationPlayed: [CARD_ID],houseAnimalType: null, houseAnimalCount: 0, stableAnimals: {},
    pastures: [], fenceSegments: [],
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

const createSpace = (id: string, overrides?: Partial<ActionSpace>): ActionSpace =>
  ({
    id, nameKey: `actions.${id}.name`, descriptionKey: `actions.${id}.description`,
    roundAvailable: 1, gainPerRound: {},
    canBeExecutedByPlayer: () => true, execute: () => ({ type: 'ok' }),
    resources: { wood: 0, clay: 0, reed: 0, stone: 0, food: 0, grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0 },
    takenBy: [],
    ...overrides,
  }) as ActionSpace

const findListener = (id: string) => getRegisteredCardListeners().find(l => l.id === id)

describe('D144_WaterWorker', () => {
  it('gains 1 reed after collecting from fishing', () => {
    const listener = findListener('D144-water-worker-after-collect')!
    expect(listener).toBeDefined()
    const player = createPlayer()
    const space = createSpace('fishing', { gainPerRound: { food: 1 } })
    const result = executeCardListener(listener, {
      state: createState(player), player, space,
      actionId: 'collect', phase: 'after',
      result: { type: 'ok', resourcesGained: { food: 3 } },
    } as unknown as CardListenerContext)
    expect(result).toBeDefined()
    expect(result!.flow).toBeDefined()
    const leaf = result!.flow as Extract<ActionFlow, { type: 'leaf' }>
    expect(leaf.actionId).toBe('gain')
    expect(leaf.params).toEqual({ reed: 1 })
  })

  it('gains 1 reed after place-farmer on day-laborer', () => {
    const listener = findListener('D144-water-worker-after-place-farmer')!
    expect(listener).toBeDefined()
    const player = createPlayer()
    const result = executeCardListener(listener, {
      state: createState(player), player, space: createSpace('day-laborer'),
      actionId: 'place-farmer', phase: 'after',
    } as unknown as CardListenerContext)
    expect(result).toBeDefined()
    const leaf = result!.flow as Extract<ActionFlow, { type: 'leaf' }>
    expect(leaf.actionId).toBe('gain')
    expect(leaf.params).toEqual({ reed: 1 })
  })

  it('gains 1 reed after place-farmer on reed-bank', () => {
    const listener = findListener('D144-water-worker-after-place-farmer')!
    const player = createPlayer()
    const result = executeCardListener(listener, {
      state: createState(player), player, space: createSpace('reed-bank'),
      actionId: 'place-farmer', phase: 'after',
    } as unknown as CardListenerContext)
    expect(result).toBeDefined()
    const leaf = result!.flow as Extract<ActionFlow, { type: 'leaf' }>
    expect(leaf.actionId).toBe('gain')
    expect(leaf.params).toEqual({ reed: 1 })
  })

  it('gains 1 reed after place-farmer on round 4 action space', () => {
    const listener = findListener('D144-water-worker-after-place-farmer')!
    const player = createPlayer()
    const state = createState(player)
    state.roundActionOrder[3] = 'eastern-quarry' // round 4 = index 3
    const result = executeCardListener(listener, {
      state, player, space: createSpace('eastern-quarry'),
      actionId: 'place-farmer', phase: 'after',
    } as unknown as CardListenerContext)
    expect(result).toBeDefined()
    const leaf = result!.flow as Extract<ActionFlow, { type: 'leaf' }>
    expect(leaf.actionId).toBe('gain')
    expect(leaf.params).toEqual({ reed: 1 })
  })

  it('does not trigger for unrelated spaces', () => {
    const listener = findListener('D144-water-worker-after-place-farmer')!
    const player = createPlayer()
    const result = executeCardListener(listener, {
      state: createState(player), player, space: createSpace('farmland'),
      actionId: 'place-farmer', phase: 'after',
    } as unknown as CardListenerContext)
    expect(result).toBeUndefined()
  })

})
