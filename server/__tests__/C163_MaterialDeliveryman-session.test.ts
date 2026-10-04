import { describe, expect, it } from 'vitest'
import { getRegisteredCardListeners, executeCardListener, type CardListenerContext } from '../../shared/cards/card-listeners'
import type { DraftGameEvent } from '../../shared/contract/events'
import type { ActionSpace, GameState, PlayerState } from '../../shared/contract/types'

import '../../shared/cards/C/C163_MaterialDeliveryman'
import type { ActionFlow } from '../../shared/contract/types'

const CARD_ID = 'C163_MaterialDeliveryman'

const createPlayer = (id: string): PlayerState =>
  ({
    id,
    name: id,
    color: 'red',
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
  }) as PlayerState

const createState = (...players: PlayerState[]): GameState =>
  ({
    round: 3,
    roundPhase: 'work',
    currentPlayerIndex: 0,
    players,
    actionSpaces: [],
    log: [],
    roundActionOrder: Array.from({ length: 14 }).map(() => null),
    gameSeed: 1,
    availableMajorImprovements: [],
    futureMeeples: [],
    pendingFutureMeeples: [],
    gameOver: false,
    workPhaseObtainedResources: {},
  }) as GameState

const createSpace = (id: string): ActionSpace =>
  ({
    id,
    nameKey: `actions.${id}.name`,
    descriptionKey: `actions.${id}.description`,
    roundAvailable: 1,
    gainPerRound: {},
    canBeExecutedByPlayer: () => true,
    execute: () => ({ type: 'ok' }),
    resources: { wood: 0, clay: 0, reed: 0, stone: 0, food: 0, grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0 },
    takenBy: [],
  }) as ActionSpace

const findListener = (id: string) =>
  getRegisteredCardListeners().find((l) => l.id === id)

const moved = (
  resources: DraftGameEvent<'resource.moved'>['resources'],
  playerId: string,
  from: DraftGameEvent<'resource.moved'>['from'] = { kind: 'actionSpace', spaceId: 'forest' },
): DraftGameEvent<'resource.moved'> => ({
  type: 'resource.moved',
  resources,
  from,
  to: { kind: 'player', playerId },
  reason: from.kind === 'actionSpace' ? 'collect' : 'cardEffect',
})

describe('C163_MaterialDeliveryman', () => {
  it('gives 1 wood when any player collects exactly 5 goods', () => {
    const listener = findListener('C163-material-deliveryman-any-collect')
    expect(listener).toBeDefined()

    const owner = createPlayer('p1')
    owner.occupationPlayed.push(CARD_ID)
    const trigger = createPlayer('p2')

    const result = executeCardListener(listener!, {
      state: createState(owner, trigger),
      player: trigger,
      ownerPlayer: owner,
      triggerPlayer: trigger,
      space: createSpace('forest'),
      actionId: 'collect',
      phase: 'after',
      result: { type: 'ok' },
      transactionEvents: [moved({ wood: 5 }, trigger.id)],
    } as unknown as CardListenerContext)

    expect(result).toBeDefined()
    expect(result!.flow!.type).toBe('leaf')
    expect((result!.flow as Extract<ActionFlow, { type: 'leaf' }>).actionId).toBe('gain')
    expect((result!.flow as Extract<ActionFlow, { type: 'leaf' }>).params).toEqual({ wood: 1 })
  })

  it('gives 1 clay when any player collects exactly 6 goods', () => {
    const listener = findListener('C163-material-deliveryman-any-collect')!
    const owner = createPlayer('p1')
    owner.occupationPlayed.push(CARD_ID)
    const trigger = createPlayer('p2')

    const result = executeCardListener(listener, {
      state: createState(owner, trigger),
      player: trigger,
      ownerPlayer: owner,
      triggerPlayer: trigger,
      space: createSpace('forest'),
      actionId: 'collect',
      phase: 'after',
      result: { type: 'ok' },
      transactionEvents: [moved({ wood: 6 }, trigger.id)],
    } as unknown as CardListenerContext)

    expect(result).toBeDefined()
    expect((result!.flow as Extract<ActionFlow, { type: 'leaf' }>).params).toEqual({ clay: 1 })
  })

  it('gives 1 reed when any player collects exactly 7 goods', () => {
    const listener = findListener('C163-material-deliveryman-any-collect')!
    const owner = createPlayer('p1')
    owner.occupationPlayed.push(CARD_ID)
    const trigger = createPlayer('p2')

    const result = executeCardListener(listener, {
      state: createState(owner, trigger),
      player: trigger,
      ownerPlayer: owner,
      triggerPlayer: trigger,
      space: createSpace('forest'),
      actionId: 'collect',
      phase: 'after',
      result: { type: 'ok' },
      transactionEvents: [moved({ wood: 7 }, trigger.id)],
    } as unknown as CardListenerContext)

    expect(result).toBeDefined()
    expect((result!.flow as Extract<ActionFlow, { type: 'leaf' }>).params).toEqual({ reed: 1 })
  })

  it('gives 1 stone when any player collects 8+ goods', () => {
    const listener = findListener('C163-material-deliveryman-any-collect')!
    const owner = createPlayer('p1')
    owner.occupationPlayed.push(CARD_ID)
    const trigger = createPlayer('p2')

    const result = executeCardListener(listener, {
      state: createState(owner, trigger),
      player: trigger,
      ownerPlayer: owner,
      triggerPlayer: trigger,
      space: createSpace('forest'),
      actionId: 'collect',
      phase: 'after',
      result: { type: 'ok' },
      transactionEvents: [moved({ wood: 8 }, trigger.id)],
    } as unknown as CardListenerContext)

    expect(result).toBeDefined()
    expect((result!.flow as Extract<ActionFlow, { type: 'leaf' }>).params).toEqual({ stone: 1 })
  })

  it('gives 1 stone when any player collects 10 goods (mixed resources)', () => {
    const listener = findListener('C163-material-deliveryman-any-collect')!
    const owner = createPlayer('p1')
    owner.occupationPlayed.push(CARD_ID)
    const trigger = createPlayer('p2')

    const result = executeCardListener(listener, {
      state: createState(owner, trigger),
      player: trigger,
      ownerPlayer: owner,
      triggerPlayer: trigger,
      space: createSpace('resource-market-4'),
      actionId: 'collect',
      phase: 'after',
      result: { type: 'ok' },
      transactionEvents: [moved({ wood: 3, clay: 3, reed: 2, stone: 2 }, trigger.id, { kind: 'actionSpace', spaceId: 'resource-market-4' })],
    } as unknown as CardListenerContext)

    expect(result).toBeDefined()
    expect((result!.flow as Extract<ActionFlow, { type: 'leaf' }>).params).toEqual({ stone: 1 })
  })

  it('does not trigger when total goods < 5', () => {
    const listener = findListener('C163-material-deliveryman-any-collect')!
    const owner = createPlayer('p1')
    owner.occupationPlayed.push(CARD_ID)
    const trigger = createPlayer('p2')

    const result = executeCardListener(listener, {
      state: createState(owner, trigger),
      player: trigger,
      ownerPlayer: owner,
      triggerPlayer: trigger,
      space: createSpace('forest'),
      actionId: 'collect',
      phase: 'after',
      result: { type: 'ok', resourcesGained: { wood: 4 } },
      transactionEvents: [moved({ wood: 4 }, trigger.id)],
    } as unknown as CardListenerContext)

    expect(result).toBeUndefined()
  })

  it('does not trigger when result has no resourcesGained', () => {
    const listener = findListener('C163-material-deliveryman-any-collect')!
    const owner = createPlayer('p1')
    owner.occupationPlayed.push(CARD_ID)
    const trigger = createPlayer('p2')

    const result = executeCardListener(listener, {
      state: createState(owner, trigger),
      player: trigger,
      ownerPlayer: owner,
      triggerPlayer: trigger,
      space: createSpace('forest'),
      actionId: 'collect',
      phase: 'after',
      result: { type: 'ok' },
    } as unknown as CardListenerContext)

    expect(result).toBeUndefined()
  })

  it('does not trigger for supply/cardEffect goods even when result reports 5+ goods', () => {
    const listener = findListener('C163-material-deliveryman-any-collect')!
    const owner = createPlayer('p1')
    owner.occupationPlayed.push(CARD_ID)
    const trigger = createPlayer('p2')

    const result = executeCardListener(listener, {
      state: createState(owner, trigger),
      player: trigger,
      ownerPlayer: owner,
      triggerPlayer: trigger,
      space: createSpace('forest'),
      actionId: 'collect',
      phase: 'after',
      result: { type: 'ok', resourcesGained: { wood: 5 } },
      transactionEvents: [moved({ wood: 5 }, trigger.id, { kind: 'supply' })],
    } as unknown as CardListenerContext)

    expect(result).toBeUndefined()
  })

  it('ignores stale transaction goods when actionEvents has no current threshold', () => {
    const listener = findListener('C163-material-deliveryman-any-collect')!
    const owner = createPlayer('p1')
    owner.occupationPlayed.push(CARD_ID)
    const trigger = createPlayer('p2')

    const result = executeCardListener(listener, {
      state: createState(owner, trigger),
      player: trigger,
      ownerPlayer: owner,
      triggerPlayer: trigger,
      space: createSpace('forest'),
      actionId: 'collect',
      phase: 'after',
      result: { type: 'ok', resourcesGained: { wood: 5 } },
      transactionEvents: [moved({ wood: 5 }, trigger.id)],
      actionEvents: [moved({ wood: 4 }, trigger.id)],
    } as unknown as CardListenerContext)

    expect(result).toBeUndefined()
  })
})
