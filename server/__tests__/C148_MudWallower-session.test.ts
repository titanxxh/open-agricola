import { describe, expect, it } from 'vitest'
import { getCardEffect } from '../../shared/cards/card-effects'
import { getRegisteredCardListeners, executeCardListener, type CardListenerContext } from '../../shared/cards/card-listeners'
import { computeAnimalZones } from '../../shared/domain/animal-zones'
import type { GameState, PlayerState, ActionSpace } from '../../shared/contract/types'
import { GameSession } from '../game/authoritative-session'
import {
  markAllWorkersUsed,
  setActiveWorkerCount,
  setNewbornCount,
  setWorkersAtHome,
} from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import '../../shared/cards/C/C148_MudWallower'

const CARD_ID = 'C148_MudWallower'

const setupSession = (actorIndex: number, counter = 0, held = 0) => {
  const session = new GameSession(148, undefined, { playerCount: 4 })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = actorIndex
  state.round = 5
  state.roundPhase = 'work'
  state.players.forEach((player, index) => {
    setWorkersAtHome(state, player, 2)
    player.minorHand = [`__c148_minor_p${index + 1}__`]
    player.occupationHand = [`__c148_occupation_p${index + 1}__`]
  })
  const owner = state.players[0]!
  owner.occupationPlayed = [CARD_ID]
  owner.cardStates = {
    [CARD_ID]: { counters: { counter, held }, infobox: `${counter} / 4` },
  }
  session.loadState(state)
  return session
}

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

const createSpace = (id: string, gainPerRound: Partial<Record<string, number>> = {}): ActionSpace =>
  ({
    id, nameKey: `actions.${id}.name`, descriptionKey: `actions.${id}.description`,
    roundAvailable: 1, gainPerRound,
    canBeExecutedByPlayer: () => true, execute: () => ({ type: 'ok' }),
    resources: { wood: 0, clay: 0, reed: 0, stone: 0, food: 0, grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0 },
    takenBy: [],
  }) as ActionSpace

const findListener = (id: string) => getRegisteredCardListeners().find(l => l.id === id)

describe('C148_MudWallower', () => {
  it('onBuy initializes counter and held to 0', () => {
    const effect = getCardEffect(CARD_ID)
    expect(effect).toBeDefined()

    const player = createPlayer()
    const state = createState(player)

    effect!.onBuy!(state, player)
    expect(player.cardStates?.[CARD_ID]?.counters?.counter).toBe(0)
    expect(player.cardStates?.[CARD_ID]?.counters?.held).toBe(0)
    expect(player.cardStates?.[CARD_ID]?.infobox).toBe('0 / 4')
  })

  it('returns counter increment flow on accumulation space use', () => {
    const listener = findListener('C148-mud-wallower-after-place-farmer')
    expect(listener).toBeDefined()

    const player = createPlayer()
    const effect = getCardEffect(CARD_ID)
    effect!.onBuy!(createState(player), player)
    const state = createState(player)

    // Place farmer on an accumulation space (wood: 3 per round)
    const result = executeCardListener(listener!, {
      state, player, space: createSpace('forest', { wood: 3 }),
      actionId: 'place-farmer', phase: 'after',
    } as unknown as CardListenerContext)

    expect(result?.flow).toEqual({
      type: 'seq',
      children: [
        {
          type: 'leaf',
          actionId: 'special-effect',
          sourceCard: CARD_ID,
          params: { kind: 'set-counter', key: 'counter', value: 1 },
        },
        {
          type: 'leaf',
          actionId: 'special-effect',
          sourceCard: CARD_ID,
          params: { kind: 'set-infobox', text: '1 / 4' },
        },
      ],
    })
    expect(player.cardStates?.[CARD_ID]?.counters?.counter).toBe(0)
  })

  it('returns reset, held increment, and pig gain flow on 4th accumulation space use', () => {
    const listener = findListener('C148-mud-wallower-after-place-farmer')
    expect(listener).toBeDefined()

    const player = createPlayer()
    const effect = getCardEffect(CARD_ID)
    effect!.onBuy!(createState(player), player)

    // Simulate 3 previous accumulation uses
    player.cardStates![CARD_ID]!.counters!.counter = 3

    const state = createState(player)

    // 4th placement
    const result = executeCardListener(listener!, {
      state, player, space: createSpace('forest', { wood: 3 }),
      actionId: 'place-farmer', phase: 'after',
    } as unknown as CardListenerContext)

    expect(result).toBeDefined()
    expect(result!.flow).toEqual({
      type: 'seq',
      children: [
        {
          type: 'leaf',
          actionId: 'special-effect',
          sourceCard: CARD_ID,
          params: { kind: 'set-counter', key: 'counter', value: 0 },
        },
        {
          type: 'leaf',
          actionId: 'special-effect',
          sourceCard: CARD_ID,
          params: { kind: 'set-counter', key: 'held', value: 1 },
        },
        {
          type: 'leaf',
          actionId: 'special-effect',
          sourceCard: CARD_ID,
          params: { kind: 'set-infobox', text: '0 / 4' },
        },
        {
          type: 'leaf',
          actionId: 'gain',
          sourceCard: CARD_ID,
          params: { boar: 1 },
          choiceLabelKey: undefined,
          choiceLabelParams: undefined,
        },
      ],
    })

    // Counter and held update only when the engine executes the returned flow.
    expect(player.cardStates?.[CARD_ID]?.counters?.counter).toBe(3)
    expect(player.cardStates?.[CARD_ID]?.counters?.held).toBe(0)
  })

  it('does not trigger on non-accumulation spaces', () => {
    const listener = findListener('C148-mud-wallower-after-place-farmer')
    expect(listener).toBeDefined()

    const player = createPlayer()
    const effect = getCardEffect(CARD_ID)
    effect!.onBuy!(createState(player), player)

    const state = createState(player)

    const result = executeCardListener(listener!, {
      state, player, space: createSpace('farmland', {}),
      actionId: 'place-farmer', phase: 'after',
    } as unknown as CardListenerContext)

    // Counter should not increment
    expect(player.cardStates?.[CARD_ID]?.counters?.counter).toBe(0)
    expect(result).toBeUndefined()
  })

  it('onComputeAnimalZones provides pig holder zone', () => {
    const effect = getCardEffect(CARD_ID)
    expect(effect).toBeDefined()

    const player = createPlayer()
    player.cardStates = {
      [CARD_ID]: { counters: { counter: 0, held: 2 } },
    }

    const zones = computeAnimalZones(player)
    const cardZone = zones.find(z => z.id === `card:${CARD_ID}`)
    expect(cardZone).toBeDefined()
    expect(cardZone!.capacity).toBe(2)
    expect(cardZone!.animalType).toBe('boar')
  })

  it('no animal zone when held is 0', () => {
    const effect = getCardEffect(CARD_ID)
    expect(effect).toBeDefined()

    const player = createPlayer()
    player.cardStates = {
      [CARD_ID]: { counters: { counter: 0, held: 0 } },
    }

    const zones = computeAnimalZones(player)
    const cardZone = zones.find(z => z.id === `card:${CARD_ID}`)
    expect(cardZone).toBeUndefined()
  })

  it('returns held-downward sync flow when player has fewer pigs than cap', () => {
    const exchangeListener = findListener('C148-mud-wallower-after-exchange')
    expect(exchangeListener).toBeDefined()

    const player = createPlayer()
    player.cardStates = {
      [CARD_ID]: { counters: { counter: 0, held: 2 } },
    }
    // Player has only 1 pig now (1 was cooked / paid away)
    player.resources.boar = 1

    const state = createState(player)

    const result = executeCardListener(exchangeListener!, {
      state, player,
      space: createSpace('exchange'),
      actionId: 'exchange', phase: 'after',
    } as unknown as CardListenerContext)

    expect(result?.flow).toEqual({
      type: 'leaf',
      actionId: 'special-effect',
      sourceCard: CARD_ID,
      params: { kind: 'set-counter', key: 'held', value: 1 },
    })
    expect(player.cardStates?.[CARD_ID]?.counters?.held).toBe(2)
  })

  it('held is permanent - does not increase when pig count grows back', () => {
    // The reference behavior: once cap is reduced, it stays reduced even if pig count
    // returns to the original level (e.g., via breeding).
    const exchangeListener = findListener('C148-mud-wallower-after-exchange')
    expect(exchangeListener).toBeDefined()

    const player = createPlayer()
    player.cardStates = {
      [CARD_ID]: { counters: { counter: 0, held: 1 } },
    }
    // Player has 3 pigs - more than held cap. syncHeld should NOT raise cap.
    player.resources.boar = 3

    const state = createState(player)

    executeCardListener(exchangeListener!, {
      state, player,
      space: createSpace('exchange'),
      actionId: 'exchange', phase: 'after',
    } as unknown as CardListenerContext)

    // held remains at 1 (no upward sync)
    expect(player.cardStates?.[CARD_ID]?.counters?.held).toBe(1)
  })
})

describe('C148 Mud Wallower public session', () => {
  it.each([
    { counter: 0, expected: 1 },
    { counter: 1, expected: 2 },
    { counter: 2, expected: 3 },
  ])('C148 S1: owner accumulation use advances counter $counter to $expected without gaining a boar', ({ counter, expected }) => {
    const session = setupSession(0, counter)
    const response = session.takeAction(0, 'forest')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.cardStates[CARD_ID]?.counters).toMatchObject({
      counter: expected,
      held: 0,
    })
    expect(response.state.players[0]!.resources.boar).toBe(0)
  })

  it('C148 S1: the fourth owner accumulation use resets the counter and puts the gained boar on the card', () => {
    const session = setupSession(0, 3)
    const response = session.takeAction(0, 'forest')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.cardStates[CARD_ID]?.counters).toMatchObject({
      counter: 0,
      held: 1,
    })
    expect(response.state.players[0]!.resources.boar).toBe(1)
    expect(response.interaction).toMatchObject({
      stateId: 'wait',
      promptKey: 'ui.interactionAnimalReorg',
      request: {
        kind: 'animal-reorg',
        zones: expect.arrayContaining([
          expect.objectContaining({
            id: `card:${CARD_ID}`,
            animalType: 'boar',
            animalCount: 1,
            capacity: 1,
          }),
        ]),
      },
    })
  })

  it('C148 S2: opponent accumulation use and owner non-accumulation use do not advance the counter', () => {
    const opponentSession = setupSession(1)
    const opponentResponse = opponentSession.takeAction(1, 'forest')

    expect(opponentResponse.ok, opponentResponse.error).toBe(true)
    expect(opponentResponse.state.players[0]!.cardStates[CARD_ID]?.counters?.counter).toBe(0)

    const ownerSession = setupSession(0)
    const ownerResponse = ownerSession.takeAction(0, 'day-laborer')

    expect(ownerResponse.ok, ownerResponse.error).toBe(true)
    expect(ownerResponse.state.players[0]!.cardStates[CARD_ID]?.counters?.counter).toBe(0)
  })

  it('C148 S7: two held boars breed and the newborn is housed outside the card', () => {
    const session = new GameSession(148, undefined, { playerCount: 4 })
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.round = 4
    state.roundPhase = 'work'
    state.players.forEach((player, index) => {
      player.minorHand = [`__c148_minor_p${index + 1}__`]
      player.occupationHand = [`__c148_occupation_p${index + 1}__`]
      markAllWorkersUsed(state, player)
      setActiveWorkerCount(player, 2)
      setNewbornCount(player, 0)
      player.resources.food = 8
    })
    const owner = state.players[0]!
    owner.occupationPlayed = [CARD_ID]
    owner.cardStates = {
      [CARD_ID]: { counters: { counter: 0, held: 2 }, infobox: '0 / 4' },
    }
    owner.resources.boar = 2
    session.loadState(state)

    let response = session.performRoundEnd()

    expect(response.ok, response.error).toBe(true)
    expect(response.interaction).toMatchObject({
      stateId: 'wait',
      request: {
        kind: 'animal-reorg',
        zones: expect.arrayContaining([
          expect.objectContaining({
            id: `card:${CARD_ID}`,
            animalType: 'boar',
            animalCount: 3,
            capacity: 2,
          }),
        ]),
      },
    })

    response = session.resolveChoice(0, 'confirm', [
      { id: 'house', zoneType: 'house', animalType: 'boar', animalCount: 1 },
      { id: `card:${CARD_ID}`, zoneType: 'card', animalType: 'boar', animalCount: 2 },
    ] as unknown as Record<string, unknown>)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.boar).toBe(3)
    expect(response.state.players[0]!).toMatchObject({
      houseAnimalType: 'boar',
      houseAnimalCount: 1,
    })
    expect(response.state.players[0]!.cardStates[CARD_ID]?.counters?.held).toBe(2)
  })
})
