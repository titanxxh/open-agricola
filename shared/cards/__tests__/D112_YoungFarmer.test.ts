import { describe, expect, it } from 'vitest'
import {
  getRegisteredCardListeners,
  executeCardListener,
} from '../card-listeners'
import type { GameState, PlayerState, ActionSpace , ActionFlow } from '../../game/types'

import '../D/D112_YoungFarmer'

const CARD_ID = 'D112_YoungFarmer'

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
    round: 3, currentPlayerIndex: 0, players,
    actionSpaces: [
      createSpace('major-improvement', { takenBy: [{ playerId: 'p2', workerId: '1' }] }),
    ],
    log: [], roundStartSnapshot: null,
    roundActionOrder: Array.from({ length: 14 }).map(() => null),
    gameSeed: 1, availableMajorImprovements: [],
    futureMeeples: [], pendingFutureMeeples: [],
    gameOver: false, workPhaseObtainedResources: {},
  }) as GameState

const findListener = (id: string) => getRegisteredCardListeners().find(l => l.id === id)

describe('D112_YoungFarmer', () => {
  it('gains 1 grain during place-farmer on major-improvement', () => {
    const listener = findListener('D112-young-farmer-during-place-farmer')!
    expect(listener).toBeDefined()
    const player = createPlayer()
    const result = executeCardListener(listener, {
      state: createState(player), player, space: createSpace('major-improvement'),
      actionId: 'place-farmer', phase: 'during',
    } as any)
    expect(result).toBeDefined()
    const leaf = result!.flow as Extract<ActionFlow, { type: 'leaf' }>
    expect(leaf.actionId).toBe('gain')
    expect(leaf.params).toEqual({ grain: 1 })
  })

  it('offers optional sow after place-farmer on major-improvement', () => {
    const listener = findListener('D112-young-farmer-after-place-farmer')!
    expect(listener).toBeDefined()
    const player = createPlayer()
    const result = executeCardListener(listener, {
      state: createState(player), player, space: createSpace('major-improvement'),
      actionId: 'place-farmer', phase: 'after',
    } as any)
    expect(result).toBeDefined()
    const leaf = result!.flow as Extract<ActionFlow, { type: 'leaf' }>
    expect(leaf.actionId).toBe('sow')
    expect(leaf.optional).toBe(true)
  })

  it('does not trigger for non-major-improvement spaces', () => {
    const listener = findListener('D112-young-farmer-during-place-farmer')!
    const player = createPlayer()
    const result = executeCardListener(listener, {
      state: createState(player), player, space: createSpace('farmland'),
      actionId: 'place-farmer', phase: 'during',
    } as any)
    expect(result).toBeUndefined()
  })

  it('computeArgs adds occupied major-improvement as extra option', () => {
    const listener = findListener('D112-young-farmer-compute-args-place-farmer')!
    expect(listener).toBeDefined()
    const player = createPlayer()
    const state = createState(player)

    const result = executeCardListener(listener, {
      state, player, space: createSpace('place-farmer'),
      actionId: 'place-farmer', phase: 'computeArgs',
      result: { type: 'choice', options: [] },
    } as any)
    expect(result).toBeDefined()
    expect(result!.extraOptions).toHaveLength(1)
    expect(result!.extraOptions![0].value).toBe('allow-occupied:major-improvement')
  })

  it('computeArgs does not add when major-improvement is unoccupied', () => {
    const listener = findListener('D112-young-farmer-compute-args-place-farmer')!
    const player = createPlayer()
    const state = createState(player)
    const majorSpace = state.actionSpaces.find(s => s.id === 'major-improvement')!
    majorSpace.takenBy = []

    const result = executeCardListener(listener, {
      state, player, space: createSpace('place-farmer'),
      actionId: 'place-farmer', phase: 'computeArgs',
      result: { type: 'choice', options: [] },
    } as any)
    expect(result).toBeUndefined()
  })
})
