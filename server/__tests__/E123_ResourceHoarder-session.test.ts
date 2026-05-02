import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { getCardEffect } from '../../shared/cards/card-effects'
import { getRegisteredCardListeners, executeCardListener } from '../../shared/cards/card-listeners'
import type { CardListenerContext } from '../../shared/cards/card-listeners'
import type { ActionSpace, GameState, PlayerState, Resource } from '../../shared/game/types'

import '../../shared/cards/E/E123_ResourceHoarder'

const CARD_ID = 'E123_ResourceHoarder'

const emptyResources = (): Resource => ({
  wood: 0, clay: 0, reed: 0, stone: 0, food: 0,
  grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0,
})

const createPlayer = (id = 'p1', overrides?: Partial<PlayerState>): PlayerState => ({
  id, name: id, color: 'red',
  resources: emptyResources(),
  workers: [
    { id: '1', isActive: true, isNewborn: false },
    { id: '2', isActive: true, isNewborn: false },
    { id: '3', isActive: false, isNewborn: false },
    { id: '4', isActive: false, isNewborn: false },
    { id: '5', isActive: false, isNewborn: false },
  ],
  rooms: 2, houseType: 'wood',
  fields: [], fences: 0,
  roomTiles: [{ row: 0, col: 0 }, { row: 0, col: 1 }],
  stableTiles: [],
  improvements: [], minorHand: [], minorPlayed: [],
  occupationHand: [], occupationPlayed: [],houseAnimalType: null, houseAnimalCount: 0, stableAnimals: {},
  pastures: [], fenceSegments: [],
  majorEffects: { wellRounds: 0 }, startPlayer: false,
  activeModifiers: [], cardStates: {},
  ...overrides,
} as PlayerState)

const createSpace = (id: string): ActionSpace => ({
  id,
  nameKey: id,
  descriptionKey: id,
  roundAvailable: 1,
  gainPerRound: {},
  resources: emptyResources(),
  takenBy: [],
  canBeExecutedByPlayer: () => true,
  execute: () => ({ type: 'ok' }),
  resolveChoice: () => ({ type: 'ok' }),
})

describe('E123_ResourceHoarder session', () => {
  it('onBuy initializes the stack with 6 resources bottom to top', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)

    const player = state.players[0]!
    player.occupationPlayed.push(CARD_ID)

    session.loadState(state)

    const effect = getCardEffect(CARD_ID)
    expect(effect).toBeDefined()
    effect!.onBuy!(state, player)

    const stack = player.cardStates?.[CARD_ID]?.stack
    expect(stack).toBeDefined()
    expect(stack).toEqual(['stone', 'clay', 'stone', 'reed', 'wood', 'clay'])
  })

  it('computeCosts listener offers discount of top resource (clay)', () => {
    const listeners = getRegisteredCardListeners()
    const costListener = listeners.find((l) => l.id === 'E123-resource-hoarder-compute-costs')
    expect(costListener).toBeDefined()

    const player = createPlayer('p1', {
      occupationPlayed: [CARD_ID],
      cardStates: {
        [CARD_ID]: { stack: ['stone', 'clay', 'stone', 'reed', 'wood', 'clay'] },
      },
    })
    const state: GameState = {
      round: 5, currentPlayerIndex: 0, players: [player],
      actionSpaces: [], log: [], roundStartSnapshot: null,
      roundActionOrder: Array.from({ length: 14 }).map(() => null),
      gameSeed: 1, availableMajorImprovements: [],
      futureMeeples: [], pendingFutureMeeples: [],
      gameOver: false, workPhaseObtainedResources: {},
    } as GameState

    const context: CardListenerContext = {
      state, player, space: createSpace('construct'),
      actionId: 'construct', phase: 'computeCosts',
    } as CardListenerContext

    const result = executeCardListener(costListener!, context)
    expect(result).toBeDefined()
    expect(result!.bonuses).toBeDefined()
    expect(result!.bonuses).toHaveLength(1)
    // 7b1 use-top-k upgrade: bonuses[0] now carries N+1 BonusChoice entries.
    // For stack [stone, clay, stone, reed, wood, clay] (N=6), choices[1]
    // (k=1, top-1) is still the legacy "clay 1" discount.
    expect(result!.bonuses![0]!.choices).toBeDefined()
    expect(result!.bonuses![0]!.choices!).toHaveLength(7)
    expect(result!.bonuses![0]!.choices![1]!.discount).toEqual({ clay: 1 })
    expect(result!.bonuses![0]!.optional).toBe(true)
    expect(result!.bonuses![0]!.sources).toEqual([CARD_ID])
  })

  it('computeCosts listener returns nothing when stack is empty', () => {
    const listeners = getRegisteredCardListeners()
    const costListener = listeners.find((l) => l.id === 'E123-resource-hoarder-compute-costs')

    const player = createPlayer('p1', {
      occupationPlayed: [CARD_ID],
      cardStates: { [CARD_ID]: { stack: [] } },
    })
    const state: GameState = {
      round: 5, currentPlayerIndex: 0, players: [player],
      actionSpaces: [], log: [], roundStartSnapshot: null,
      roundActionOrder: Array.from({ length: 14 }).map(() => null),
      gameSeed: 1, availableMajorImprovements: [],
      futureMeeples: [], pendingFutureMeeples: [],
      gameOver: false, workPhaseObtainedResources: {},
    } as GameState

    const context: CardListenerContext = {
      state, player, space: createSpace('construct'),
      actionId: 'construct', phase: 'computeCosts',
    } as CardListenerContext

    const result = executeCardListener(costListener!, context)
    expect(result).toBeUndefined()
  })

  it('after-pay listener pops top resource from stack', () => {
    const listeners = getRegisteredCardListeners()
    const afterPayListener = listeners.find((l) => l.id === 'E123-resource-hoarder-after-pay')
    expect(afterPayListener).toBeDefined()

    const player = createPlayer('p1', {
      occupationPlayed: [CARD_ID],
      cardStates: {
        [CARD_ID]: { stack: ['stone', 'clay', 'stone', 'reed', 'wood', 'clay'] },
      },
      _activeActionBonusSources: [CARD_ID],
    })
    const state: GameState = {
      round: 5, currentPlayerIndex: 0, players: [player],
      actionSpaces: [], log: [], roundStartSnapshot: null,
      roundActionOrder: Array.from({ length: 14 }).map(() => null),
      gameSeed: 1, availableMajorImprovements: [],
      futureMeeples: [], pendingFutureMeeples: [],
      gameOver: false, workPhaseObtainedResources: {},
    } as GameState

    const context: CardListenerContext = {
      state, player, space: createSpace('construct'),
      actionId: 'construct', phase: 'after',
    } as CardListenerContext

    executeCardListener(afterPayListener!, context)
    expect(player.cardStates[CARD_ID]!.stack).toEqual(
      ['stone', 'clay', 'stone', 'reed', 'wood'],
    )
  })

  it('after-pay listener does nothing when stack is empty', () => {
    const listeners = getRegisteredCardListeners()
    const afterPayListener = listeners.find((l) => l.id === 'E123-resource-hoarder-after-pay')

    const player = createPlayer('p1', {
      occupationPlayed: [CARD_ID],
      cardStates: { [CARD_ID]: { stack: [] } },
    })
    const state: GameState = {
      round: 5, currentPlayerIndex: 0, players: [player],
      actionSpaces: [], log: [], roundStartSnapshot: null,
      roundActionOrder: Array.from({ length: 14 }).map(() => null),
      gameSeed: 1, availableMajorImprovements: [],
      futureMeeples: [], pendingFutureMeeples: [],
      gameOver: false, workPhaseObtainedResources: {},
    } as GameState

    const context: CardListenerContext = {
      state, player, space: createSpace('construct'),
      actionId: 'construct', phase: 'after',
    } as CardListenerContext

    executeCardListener(afterPayListener!, context)
    expect(player.cardStates[CARD_ID]!.stack).toEqual([])
  })

  it('after-pay listener does NOT pop when E123 was not used in payment', () => {
    // Bug fix: previously the after-pay listener popped unconditionally.
    // It must only pop when _activeActionBonusSources includes E123.
    const listeners = getRegisteredCardListeners()
    const afterPayListener = listeners.find((l) => l.id === 'E123-resource-hoarder-after-pay')
    expect(afterPayListener).toBeDefined()

    const player = createPlayer('p1', {
      occupationPlayed: [CARD_ID],
      cardStates: {
        [CARD_ID]: { stack: ['stone', 'clay', 'stone', 'reed', 'wood', 'clay'] },
      },
      // _activeActionBonusSources is the canonical "this card's bonus actually fired" signal.
      _activeActionBonusSources: [], // E123 NOT in the list
    })
    const state: GameState = {
      round: 5, currentPlayerIndex: 0, players: [player],
      actionSpaces: [], log: [], roundStartSnapshot: null,
      roundActionOrder: Array.from({ length: 14 }).map(() => null),
      gameSeed: 1, availableMajorImprovements: [],
      futureMeeples: [], pendingFutureMeeples: [],
      gameOver: false, workPhaseObtainedResources: {},
    } as GameState

    const context: CardListenerContext = {
      state, player, space: createSpace('construct'),
      actionId: 'construct', phase: 'after',
    } as CardListenerContext

    executeCardListener(afterPayListener!, context)
    // Stack remains intact (no pop because E123 wasn't used)
    expect(player.cardStates[CARD_ID]!.stack).toEqual(
      ['stone', 'clay', 'stone', 'reed', 'wood', 'clay'],
    )
  })

  it('after-pay listener pops only when E123 is in _activeActionBonusSources', () => {
    const listeners = getRegisteredCardListeners()
    const afterPayListener = listeners.find((l) => l.id === 'E123-resource-hoarder-after-pay')!

    const player = createPlayer('p1', {
      occupationPlayed: [CARD_ID],
      cardStates: {
        [CARD_ID]: { stack: ['stone', 'clay', 'stone', 'reed', 'wood', 'clay'] },
      },
      _activeActionBonusSources: [CARD_ID],
    })
    const state: GameState = {
      round: 5, currentPlayerIndex: 0, players: [player],
      actionSpaces: [], log: [], roundStartSnapshot: null,
      roundActionOrder: Array.from({ length: 14 }).map(() => null),
      gameSeed: 1, availableMajorImprovements: [],
      futureMeeples: [], pendingFutureMeeples: [],
      gameOver: false, workPhaseObtainedResources: {},
    } as GameState

    const context: CardListenerContext = {
      state, player, space: createSpace('construct'),
      actionId: 'construct', phase: 'after',
    } as CardListenerContext

    executeCardListener(afterPayListener, context)
    // Top resource (clay) was popped because the bonus actually fired
    expect(player.cardStates[CARD_ID]!.stack).toEqual(
      ['stone', 'clay', 'stone', 'reed', 'wood'],
    )
  })

  it('successive pops reveal deeper stack resources', () => {
    const listeners = getRegisteredCardListeners()
    const afterPayListener = listeners.find((l) => l.id === 'E123-resource-hoarder-after-pay')!
    const costListener = listeners.find((l) => l.id === 'E123-resource-hoarder-compute-costs')!

    const player = createPlayer('p1', {
      occupationPlayed: [CARD_ID],
      cardStates: {
        [CARD_ID]: { stack: ['stone', 'clay', 'stone', 'reed', 'wood', 'clay'] },
      },
      _activeActionBonusSources: [CARD_ID],
    })
    const state: GameState = {
      round: 5, currentPlayerIndex: 0, players: [player],
      actionSpaces: [], log: [], roundStartSnapshot: null,
      roundActionOrder: Array.from({ length: 14 }).map(() => null),
      gameSeed: 1, availableMajorImprovements: [],
      futureMeeples: [], pendingFutureMeeples: [],
      gameOver: false, workPhaseObtainedResources: {},
    } as GameState

    const mkContext = (actionId: string, phase: string) => ({
      state, player, space: createSpace(actionId),
      actionId, phase,
    } as CardListenerContext)

    // Top is clay (k=1 entry of N+1 choices)
    let result = executeCardListener(costListener, mkContext('construct', 'computeCosts'))
    expect(result!.bonuses![0]!.choices![1]!.discount).toEqual({ clay: 1 })

    // Pop clay
    executeCardListener(afterPayListener, mkContext('construct', 'after'))

    // Now top is wood
    result = executeCardListener(costListener, mkContext('construct', 'computeCosts'))
    expect(result!.bonuses![0]!.choices![1]!.discount).toEqual({ wood: 1 })

    // Pop wood
    executeCardListener(afterPayListener, mkContext('construct', 'after'))

    // Now top is reed
    result = executeCardListener(costListener, mkContext('improvement-any', 'computeCosts'))
    expect(result!.bonuses![0]!.choices![1]!.discount).toEqual({ reed: 1 })
  })
})
