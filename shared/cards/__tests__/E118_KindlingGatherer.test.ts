import { describe, expect, it } from 'vitest'
import { getRegisteredCardListeners, executeCardListener } from '../card-listeners'
import type { GameState, PlayerState, ActionSpace , ActionFlow } from '../../contract/types'
import type { DraftGameEvent } from '../../contract/events'

import '../E/E118_KindlingGatherer'
import type { CardListenerContext } from '../card-listeners'

const CARD_ID = 'E118_KindlingGatherer'
const LISTENER_ID = 'E118-kindling-gatherer-after-action-space-food'

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
    actionSpaces: [], log: [],
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

const foodMoved = (
  playerId = 'p1',
  spaceId = 'fishing',
  food = 1,
): DraftGameEvent<'resource.moved'> => ({
  type: 'resource.moved',
  resources: { food },
  from: { kind: 'actionSpace', spaceId },
  to: { kind: 'player', playerId },
  reason: 'collect',
})

const foodGainedFromSupply = (
  playerId = 'p1',
  food = 2,
): DraftGameEvent<'resource.moved'> => ({
  type: 'resource.moved',
  resources: { food },
  from: { kind: 'supply' },
  to: { kind: 'player', playerId },
  reason: 'gain',
})

describe('E118_KindlingGatherer', () => {
  it('gains 1 wood after collecting from fishing', () => {
    const listener = findListener(LISTENER_ID)!
    expect(listener).toBeDefined()
    const player = createPlayer()
    const space = createSpace('fishing', { gainPerRound: { food: 1 } })
    const actionEvents = [foodMoved(player.id, 'fishing', 3)]
    const result = executeCardListener(listener, {
      state: createState(player), player, space,
      actionId: 'collect', phase: 'after',
      result: { type: 'ok' },
      transactionEvents: actionEvents,
      actionEvents,
    } as unknown as CardListenerContext)
    expect(result).toBeDefined()
    const leaf = result!.flow as Extract<ActionFlow, { type: 'leaf' }>
    expect(leaf.actionId).toBe('gain')
    expect(leaf.params).toEqual({ wood: 1 })
  })

  it('gains 1 wood after collecting from traveling-players', () => {
    const listener = findListener(LISTENER_ID)!
    const player = createPlayer()
    const space = createSpace('traveling-players', { gainPerRound: { food: 1 } })
    const actionEvents = [foodMoved(player.id, 'traveling-players', 2)]
    const result = executeCardListener(listener, {
      state: createState(player), player, space,
      actionId: 'collect', phase: 'after',
      result: { type: 'ok' },
      transactionEvents: actionEvents,
      actionEvents,
    } as unknown as CardListenerContext)
    expect(result).toBeDefined()
    const leaf = result!.flow as Extract<ActionFlow, { type: 'leaf' }>
    expect(leaf.actionId).toBe('gain')
    expect(leaf.params).toEqual({ wood: 1 })
  })

  it('gains 1 wood after place-farmer on resource-market-4', () => {
    const listener = findListener(LISTENER_ID)!
    expect(listener).toBeDefined()
    const player = createPlayer()
    const actionEvents = [foodMoved(player.id, 'resource-market-4', 1)]
    const result = executeCardListener(listener, {
      state: createState(player), player, space: createSpace('resource-market-4'),
      actionId: 'place-farmer', phase: 'after',
      transactionEvents: actionEvents,
      actionEvents,
    } as unknown as CardListenerContext)
    expect(result).toBeDefined()
    const leaf = result!.flow as Extract<ActionFlow, { type: 'leaf' }>
    expect(leaf.actionId).toBe('gain')
    expect(leaf.params).toEqual({ wood: 1 })
  })

  it('gains 1 wood after gain with food from day-laborer', () => {
    const listener = findListener(LISTENER_ID)!
    expect(listener).toBeDefined()
    const player = createPlayer()
    const actionEvents = [foodGainedFromSupply(player.id, 2)]
    const result = executeCardListener(listener, {
      state: createState(player), player, space: createSpace('day-laborer'),
      actionId: 'gain', phase: 'after',
      result: { type: 'ok' },
      transactionEvents: actionEvents,
      actionEvents,
    } as unknown as CardListenerContext)
    expect(result).toBeDefined()
    const leaf = result!.flow as Extract<ActionFlow, { type: 'leaf' }>
    expect(leaf.actionId).toBe('gain')
    expect(leaf.params).toEqual({ wood: 1 })
  })

  it('does not trigger for unrelated spaces', () => {
    const listener = findListener(LISTENER_ID)!
    const player = createPlayer()
    const result = executeCardListener(listener, {
      state: createState(player), player, space: createSpace('farmland'),
      actionId: 'place-farmer', phase: 'after',
    } as unknown as CardListenerContext)
    expect(result).toBeUndefined()
  })

})
