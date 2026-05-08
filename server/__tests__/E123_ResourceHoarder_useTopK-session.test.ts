import { describe, expect, it } from 'vitest'
import { getRegisteredCardListeners, executeCardListener } from '../../shared/cards/card-listeners'
import type { CardListenerContext } from '../../shared/cards/card-listeners'
import type { ActionSpace, GameState, PlayerState, Resource } from '../../shared/contract/types'

import '../../shared/cards/E/E123_ResourceHoarder'

const CARD_ID = 'E123_ResourceHoarder'

const emptyResources = (): Resource => ({
  wood: 0, clay: 0, reed: 0, stone: 0, food: 0,
  grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0,
})

const createPlayer = (overrides?: Partial<PlayerState>): PlayerState => ({
  id: 'p1', name: 'p1', color: 'red',
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

const mkState = (player: PlayerState): GameState => ({
  round: 5, currentPlayerIndex: 0, players: [player],
  actionSpaces: [], log: [], roundStartSnapshot: null,
  roundActionOrder: Array.from({ length: 14 }).map(() => null),
  gameSeed: 1, availableMajorImprovements: [],
  futureMeeples: [], pendingFutureMeeples: [],
  gameOver: false, workPhaseObtainedResources: {},
} as GameState)

const findListener = (id: string) =>
  getRegisteredCardListeners().find((l) => l.id === id)!

describe('E123_ResourceHoarder use-top-k (BGA full)', () => {
  it('N=2 stack [stone, clay]: emits 3 BonusChoice (k=0/1/2)', () => {
    const player = createPlayer({
      occupationPlayed: [CARD_ID],
      cardStates: { [CARD_ID]: { stack: ['stone', 'clay'] } },
    })
    const state = mkState(player)
    const listener = findListener('E123-resource-hoarder-compute-costs')
    const context: CardListenerContext = {
      state, player, space: createSpace('improvement-any'),
      actionId: 'improvement-any', phase: 'computeCosts',
    } as CardListenerContext

    const result = executeCardListener(listener, context)
    expect(result?.bonuses).toBeDefined()
    expect(result!.bonuses!).toHaveLength(1)
    const bonus = result!.bonuses![0]!
    expect(bonus.optional).toBe(true)
    expect(bonus.sources).toEqual([CARD_ID])
    expect(bonus.choices).toBeDefined()
    expect(bonus.choices!).toHaveLength(3) // k=0, k=1, k=2
    // k=0: no discount
    expect(bonus.choices![0]!.discount).toEqual({})
    // k=1: top item (clay)
    expect(bonus.choices![1]!.discount).toEqual({ clay: 1 })
    // k=2: top 2 (clay + stone)
    expect(bonus.choices![2]!.discount).toEqual({ clay: 1, stone: 1 })
  })

  it('N=3 stack [stone, clay, wood]: emits 4 BonusChoice (k=0..3)', () => {
    const player = createPlayer({
      occupationPlayed: [CARD_ID],
      cardStates: { [CARD_ID]: { stack: ['stone', 'clay', 'wood'] } },
    })
    const state = mkState(player)
    const listener = findListener('E123-resource-hoarder-compute-costs')
    const context: CardListenerContext = {
      state, player, space: createSpace('construct'),
      actionId: 'construct', phase: 'computeCosts',
    } as CardListenerContext

    const result = executeCardListener(listener, context)
    const bonus = result!.bonuses![0]!
    expect(bonus.choices!).toHaveLength(4)
    expect(bonus.choices![0]!.discount).toEqual({})
    expect(bonus.choices![1]!.discount).toEqual({ wood: 1 })
    expect(bonus.choices![2]!.discount).toEqual({ wood: 1, clay: 1 })
    expect(bonus.choices![3]!.discount).toEqual({ wood: 1, clay: 1, stone: 1 })
  })

  it('N=2 stack [reed, reed]: top 2 same kind doubles up (reed: 2)', () => {
    const player = createPlayer({
      occupationPlayed: [CARD_ID],
      cardStates: { [CARD_ID]: { stack: ['reed', 'reed'] } },
    })
    const state = mkState(player)
    const listener = findListener('E123-resource-hoarder-compute-costs')
    const context: CardListenerContext = {
      state, player, space: createSpace('improvement-any'),
      actionId: 'improvement-any', phase: 'computeCosts',
    } as CardListenerContext

    const result = executeCardListener(listener, context)
    const bonus = result!.bonuses![0]!
    expect(bonus.choices!).toHaveLength(3)
    expect(bonus.choices![0]!.discount).toEqual({})
    expect(bonus.choices![1]!.discount).toEqual({ reed: 1 })
    expect(bonus.choices![2]!.discount).toEqual({ reed: 2 })
  })

  it('after-pay with bonusChoiceIndex k=0: no pop', () => {
    const player = createPlayer({
      occupationPlayed: [CARD_ID],
      cardStates: { [CARD_ID]: { stack: ['stone', 'clay'] } },
    })
    const state = mkState(player)
    const listener = findListener('E123-resource-hoarder-after-pay')
    const context: CardListenerContext = {
      state, player, space: createSpace('improvement-any'),
      actionId: 'pay', phase: 'after',
      result: {
        type: 'ok',
        extraData: {
          bonusUsed: [CARD_ID],
          bonusChoiceIndex: { [CARD_ID]: 0 },
        },
      },
    } as CardListenerContext

    executeCardListener(listener, context)
    expect(player.cardStates[CARD_ID]!.stack).toEqual(['stone', 'clay'])
  })

  it('after-pay with bonusChoiceIndex k=2: pops top 2', () => {
    const player = createPlayer({
      occupationPlayed: [CARD_ID],
      cardStates: { [CARD_ID]: { stack: ['stone', 'clay'] } },
    })
    const state = mkState(player)
    const listener = findListener('E123-resource-hoarder-after-pay')
    const context: CardListenerContext = {
      state, player, space: createSpace('improvement-any'),
      actionId: 'pay', phase: 'after',
      result: {
        type: 'ok',
        extraData: {
          bonusUsed: [CARD_ID],
          bonusChoiceIndex: { [CARD_ID]: 2 },
        },
      },
    } as CardListenerContext

    executeCardListener(listener, context)
    expect(player.cardStates[CARD_ID]!.stack).toEqual([])
  })
})
