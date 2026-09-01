import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { setWorkersAtHome } from '../../shared/domain/player'
import { getRegisteredCardListeners, executeCardListener, type CardListenerContext } from '../../shared/cards/card-listeners'
import type { GameState, PlayerState, ActionSpace } from '../../shared/contract/types'
import { resolveTriggerIfPresent } from './_helpers/trigger-select'

import '../../shared/cards/C/C148_MudWallower'

const CARD_ID = 'C148_MudWallower'

const paidEvent = (resources: Record<string, number>) => ({
  type: 'resource.paid',
  resources,
  paymentFor: 'cardEffect',
})

const createPlayer = (id = 'p1'): PlayerState =>
  ({
    id, name: id, color: 'red',
    resources: {
      wood: 0, clay: 0, reed: 0, stone: 0, food: 5,
      grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0,
    },
    workers: [
      { id: '1', isActive: true, isNewborn: false },
      { id: '2', isActive: true, isNewborn: false },
    ],
    rooms: 2, houseType: 'wood',
    fields: [], fences: 0, roomTiles: [], stableTiles: [],
    improvements: [], minorHand: [], minorPlayed: [],
    occupationHand: [], occupationPlayed: [CARD_ID],
    houseAnimalType: null, houseAnimalCount: 0, stableAnimals: {},
    pastures: [], fenceSegments: [],
    majorEffects: { wellRounds: 0 }, startPlayer: false,
    activeModifiers: [], cardStates: {},
  }) as PlayerState

const createState = (...players: PlayerState[]): GameState =>
  ({
    round: 1, currentPlayerIndex: 0, players,
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
    takenBy: [],
  }) as ActionSpace

const createPayBoarSpace = (boar: number): ActionSpace =>
  ({
    ...createSpace('__test-pay-boar'),
    flow: {
      type: 'leaf',
      actionId: 'pay',
      params: { cost: { boar }, costType: 'cardEffect' },
    },
  }) as ActionSpace

const findListener = (id: string) => getRegisteredCardListeners().find((l) => l.id === id)

describe('C148 MudWallower — after-pay sync listener', () => {
  it('listener registered with actions:[pay] and after phase', () => {
    const listener = findListener('C148-mud-wallower-after-pay-sync')
    expect(listener).toBeDefined()
    expect(listener!.actions).toEqual(['pay'])
    expect(listener!.phases).toEqual(['after'])
    expect(listener!.cardIds).toEqual([CARD_ID])
  })

  it('returns held-downward sync flow when boar pay drains player below cap', () => {
    const listener = findListener('C148-mud-wallower-after-pay-sync')!
    const player = createPlayer()
    player.cardStates = { [CARD_ID]: { counters: { counter: 0, held: 2 } } }
    // Player paid 1 boar (e.g. cooking): now has 1 boar, but cap is 2
    player.resources.boar = 1
    const state = createState(player)
    const payResult = { type: 'ok' as const }
    expect('resourcesPaid' in payResult).toBe(false)
    expect('extraData' in payResult).toBe(false)
    const result = executeCardListener(listener, {
      state, player,
      space: createSpace('cooking'),
      actionId: 'pay', phase: 'after',
      sourceCard: undefined,
      result: payResult,
      transactionEvents: [paidEvent({ boar: 1 })],
    } as unknown as CardListenerContext)
    expect(result?.flow).toEqual({
      type: 'leaf',
      actionId: 'special-effect',
      sourceCard: CARD_ID,
      params: { kind: 'set-counter', key: 'held', value: 1 },
    })
    expect(player.cardStates![CARD_ID]!.counters!.held).toBe(2)
  })

  it('returns held sync-to-zero flow when boar pay drains all pigs', () => {
    const listener = findListener('C148-mud-wallower-after-pay-sync')!
    const player = createPlayer()
    player.cardStates = { [CARD_ID]: { counters: { counter: 0, held: 2 } } }
    player.resources.boar = 0
    const state = createState(player)
    const payResult = { type: 'ok' as const }
    const result = executeCardListener(listener, {
      state, player,
      space: createSpace('begging-card-pay'),
      actionId: 'pay', phase: 'after',
      sourceCard: undefined,
      result: payResult,
      transactionEvents: [paidEvent({ boar: 2 })],
    } as unknown as CardListenerContext)
    expect(result?.flow).toEqual({
      type: 'leaf',
      actionId: 'special-effect',
      sourceCard: CARD_ID,
      params: { kind: 'set-counter', key: 'held', value: 0 },
    })
    expect(player.cardStates![CARD_ID]!.counters!.held).toBe(2)
  })

  it('C148 S5: a public pay action permanently lowers held to the remaining boar count', () => {
    const session = new GameSession(148, undefined, { playerCount: 4 })
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.currentPlayerIndex = 0
    state.round = 1
    state.roundPhase = 'work'
    state.actionSpaces.push(createPayBoarSpace(1))
    state.players.forEach((participant, index) => {
      participant.minorHand = [`__c148_minor_p${index + 1}__`]
      participant.occupationHand = [`__c148_occupation_p${index + 1}__`]
    })

    const player = state.players[0]!
    setWorkersAtHome(state, player, 2)
    player.occupationPlayed = [CARD_ID]
    player.cardStates = { [CARD_ID]: { counters: { counter: 0, held: 2 } } }
    player.resources = { ...player.resources, boar: 2 }
    session.loadState(state)

    let resp = session.takeAction(0, '__test-pay-boar')
    expect(resp.ok).toBe(true)
    resp = resolveTriggerIfPresent(session, resp, CARD_ID)
    expect(resp.state.events).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'resource.paid',
        resources: expect.objectContaining({ boar: 1 }),
        paymentFor: 'cardEffect',
      }),
    ]))
    expect(resp.state.players[0]!.resources.boar).toBe(1)
    expect(resp.state.players[0]!.cardStates?.[CARD_ID]?.counters?.held).toBe(1)
  })

  it('C148 S6: cooking a held boar through the Fireplace exchange permanently lowers held', () => {
    const session = new GameSession(148, undefined, { playerCount: 4 })
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.currentPlayerIndex = 0
    state.round = 1
    state.roundPhase = 'work'
    state.players.forEach((participant, index) => {
      participant.minorHand = [`__c148_minor_p${index + 1}__`]
      participant.occupationHand = [`__c148_occupation_p${index + 1}__`]
    })
    const player = state.players[0]!
    setWorkersAtHome(state, player, 2)
    player.occupationPlayed = [CARD_ID]
    player.cardStates = { [CARD_ID]: { counters: { counter: 0, held: 1 } } }
    player.resources = { ...player.resources, boar: 1, food: 0 }
    player.improvements = ['Major_Fireplace1']
    state.availableMajorImprovements = state.availableMajorImprovements.filter(
      (cardId) => cardId !== 'Major_Fireplace1',
    )
    session.loadState(state)

    expect(session.takeAction(0, 'farmland').ok).toBe(true)
    let response = session.takeAnytimeAction(0, 'exchange')
    expect(response.ok, response.error).toBe(true)
    expect(response.interaction).toMatchObject({
      stateId: 'wait',
      request: { kind: 'choice' },
    })

    response = session.resolveChoice(0, 'bulk:1=1')
    response = resolveTriggerIfPresent(session, response, CARD_ID)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ boar: 0, food: 2 })
    expect(response.state.players[0]!.cardStates[CARD_ID]?.counters?.held).toBe(0)
  })

  it('does not sync when no boar paid (e.g. wood/food only payment)', () => {
    const listener = findListener('C148-mud-wallower-after-pay-sync')!
    const player = createPlayer()
    player.cardStates = { [CARD_ID]: { counters: { counter: 0, held: 2 } } }
    player.resources.boar = 1
    const state = createState(player)
    const result = executeCardListener(listener, {
      state, player,
      space: createSpace('improvement'),
      actionId: 'pay', phase: 'after',
      sourceCard: undefined,
      result: { type: 'ok' },
      transactionEvents: [paidEvent({ boar: 1 }), paidEvent({ wood: 2, clay: 1 })],
      actionEvents: [paidEvent({ wood: 2, clay: 1 })],
    } as unknown as CardListenerContext)
    expect(result).toBeUndefined()
    expect(player.cardStates![CARD_ID]!.counters!.held).toBe(2)
  })

  it('does not raise held upward when player has more boar than cap (cap stays permanent)', () => {
    const listener = findListener('C148-mud-wallower-after-pay-sync')!
    const player = createPlayer()
    player.cardStates = { [CARD_ID]: { counters: { counter: 0, held: 1 } } }
    // boar pay happens but player still has 3 boar after — cap should NOT grow
    player.resources.boar = 3
    const state = createState(player)
    executeCardListener(listener, {
      state, player,
      space: createSpace('cooking'),
      actionId: 'pay', phase: 'after',
      sourceCard: undefined,
      result: { type: 'ok' },
      transactionEvents: [paidEvent({ boar: 1 })],
    } as unknown as CardListenerContext)
    expect(player.cardStates![CARD_ID]!.counters!.held).toBe(1)
  })

  it('no-op when result is not ok', () => {
    const listener = findListener('C148-mud-wallower-after-pay-sync')!
    const player = createPlayer()
    player.cardStates = { [CARD_ID]: { counters: { counter: 0, held: 2 } } }
    player.resources.boar = 0
    const state = createState(player)
    executeCardListener(listener, {
      state, player,
      space: createSpace('cooking'),
      actionId: 'pay', phase: 'after',
      sourceCard: undefined,
      result: { type: 'fail', errorKey: 'log.payFail' },
    } as unknown as CardListenerContext)
    // listener should not even attempt a sync since the pay failed
    expect(player.cardStates![CARD_ID]!.counters!.held).toBe(2)
  })

  it('no-op when player does not own the card', () => {
    const listener = findListener('C148-mud-wallower-after-pay-sync')!
    const player = createPlayer()
    // Strip C148 from occupationPlayed and cardStates
    player.occupationPlayed = []
    player.cardStates = {}
    player.resources.boar = 0
    const state = createState(player)
    // This listener should still be a safe no-op (no counters to mutate)
    expect(() => {
      executeCardListener(listener, {
        state, player,
        space: createSpace('cooking'),
        actionId: 'pay', phase: 'after',
        sourceCard: undefined,
        result: { type: 'ok' },
        transactionEvents: [paidEvent({ boar: 1 })],
      } as unknown as CardListenerContext)
    }).not.toThrow()
  })
})
