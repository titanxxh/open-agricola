import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { executeCardListener, getRegisteredCardListeners, type CardListenerContext } from '../../shared/cards/card-listeners'
import { playImprovement } from '../../shared/actions/effects/improvement'
import type { DraftGameEvent } from '../../shared/contract/events'
import type { ActionExecutionResult, ActionSpace, GameState, PlayerState } from '../../shared/contract/types'
import { setWorkersAtHome } from '../../shared/domain/player'

import '../../shared/cards/A/A41_VegetableSlicer'

const CARD_ID = 'A41_VegetableSlicer'
const FIREPLACE_ID = 'Major_Fireplace1'
const COOKING_HEARTH_ID = 'Major_CookingHearth1'
const FIREPLACE3_ID = 'Major_Fireplace3'
const COOKING_HEARTH3_ID = 'Major_CookingHearth3'

const createPlayer = (): PlayerState =>
  ({
    id: 'p1',
    name: 'P1',
    color: 'red',
    resources: {
      wood: 0,
      clay: 0,
      reed: 0,
      stone: 0,
      food: 0,
      grain: 0,
      vegetable: 0,
      sheep: 0,
      boar: 0,
      cattle: 0,
      begging: 0,
    },
    workers: [
      { id: '1', isActive: true, isNewborn: false },
      { id: '2', isActive: true, isNewborn: false },
      { id: '3', isActive: false, isNewborn: false },
      { id: '4', isActive: false, isNewborn: false },
      { id: '5', isActive: false, isNewborn: false },
    ],
    rooms: 2,
    houseType: 'wood',
    fields: [],
    fences: 0,
    roomTiles: [],
    stableTiles: [],
    improvements: [],
    minorHand: [],
    minorPlayed: [],
    occupationHand: [],
    occupationPlayed: [],houseAnimalType: null,
    houseAnimalCount: 0,
    stableAnimals: {},
    pastures: [],
    fenceSegments: [],
    majorEffects: { wellRounds: 0 },
    startPlayer: false,
    activeModifiers: [],
    cardStates: {},
  }) as PlayerState

const createState = (player: PlayerState): GameState =>
  ({
    round: 1,
    currentPlayerIndex: 0,
    players: [player],
    actionSpaces: [],
    log: [],
    roundStartSnapshot: null,
    roundActionOrder: [],
    gameSeed: 1,
    availableMajorImprovements: [COOKING_HEARTH_ID],
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
    resources: {
      wood: 0,
      clay: 0,
      reed: 0,
      stone: 0,
      food: 0,
      grain: 0,
      vegetable: 0,
      sheep: 0,
      boar: 0,
      cattle: 0,
      begging: 0,
    },
    takenBy: [],
  }) as ActionSpace

const findListener = (id: string) =>
  getRegisteredCardListeners().find((listener) => listener.id === id)

const playedMajor = (
  cardId = COOKING_HEARTH_ID,
): DraftGameEvent<'card.played'> => ({
  type: 'card.played',
  cardId,
  cardType: 'major',
})

const paidForImprovement = (
  returnedCardId?: string,
): DraftGameEvent<'resource.paid'> => ({
  type: 'resource.paid',
  resources: {},
  paymentFor: 'major-improvement',
  ...(returnedCardId ? { returnedCardId } : {}),
})

describe('A41_VegetableSlicer improvement listener', () => {
  it('triggers through the real major improvement action flow', () => {
    const session = new GameSession(1)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.roundPhase = 'work'
    state.availableMajorImprovements = [COOKING_HEARTH_ID]

    const player = state.players[0]!
    setWorkersAtHome(state, player, 1)
    player.minorPlayed.push(CARD_ID)
    player.improvements = [FIREPLACE_ID]
    player.resources = {
      ...player.resources,
      wood: 0,
      clay: 0,
      reed: 0,
      stone: 0,
      food: 0,
      grain: 0,
      vegetable: 0,
    }
    player.minorHand = ['__test_placeholder__']
    player.occupationHand = ['__test_placeholder__']

    state.players[1]!.minorHand = ['__test_placeholder__']
    state.players[1]!.occupationHand = ['__test_placeholder__']
    session.loadState(state)

    const resp = session.takeAction(0, 'major-improvement')

    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
    expect(resp.state.players[0]!.improvements).toContain(COOKING_HEARTH_ID)
    expect(resp.state.players[0]!.improvements).not.toContain(FIREPLACE_ID)
    expect(resp.state.players[0]!.resources.wood).toBe(2)
    expect(resp.state.players[0]!.resources.vegetable).toBe(1)
    expect(resp.state.events).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'resource.paid',
        paymentFor: 'major-improvement',
        returnedCardId: FIREPLACE_ID,
      }),
      expect.objectContaining({
        type: 'card.played',
        cardId: COOKING_HEARTH_ID,
        cardType: 'major',
      }),
      expect.objectContaining({
        type: 'card.triggered',
        cardId: CARD_ID,
      }),
      expect.objectContaining({
        type: 'resource.moved',
        from: expect.objectContaining({ kind: 'card', cardId: CARD_ID }),
        to: expect.objectContaining({ kind: 'player', playerId: player.id }),
        resources: expect.objectContaining({ wood: 2, vegetable: 1 }),
      }),
    ]))
  })

  it('gains 2 wood and 1 vegetable when Fireplace becomes Cooking Hearth', () => {
    const listener = findListener('A41-vegetable-slicer-after-improvement')
    expect(listener).toBeDefined()

    const player = createPlayer()
    player.minorPlayed = [CARD_ID]
    player.improvements = [FIREPLACE_ID]

    const state = createState(player)
    const result = playImprovement(state, player, `major:${COOKING_HEARTH_ID}`, 'any')

    expect(result.type).toBe('ok')
    const actionEvents = [paidForImprovement(FIREPLACE_ID), playedMajor()]
    const hookResult = executeCardListener(listener!, {
      state,
      player,
      space: createSpace('improvement'),
      actionId: 'improvement',
      phase: 'after',
      choice: `major:${COOKING_HEARTH_ID}`,
      result: { type: 'ok' },
      transactionEvents: actionEvents,
      actionEvents,
    } as unknown as CardListenerContext)

    expect(player.improvements).toContain(COOKING_HEARTH_ID)
    expect(player.improvements).not.toContain(FIREPLACE_ID)
    expect(hookResult?.flow).toMatchObject({
      type: 'leaf',
      actionId: 'gain',
      sourceCard: CARD_ID,
      params: { wood: 2, vegetable: 1 },
    })
  })

  it('gains 2 wood and 1 vegetable when duplicate Fireplace becomes duplicate Cooking Hearth', () => {
    const listener = findListener('A41-vegetable-slicer-after-improvement')
    expect(listener).toBeDefined()

    const player = createPlayer()
    player.minorPlayed = [CARD_ID]
    player.improvements = [FIREPLACE3_ID]

    const state = createState(player)
    const actionEvents = [paidForImprovement(FIREPLACE3_ID), playedMajor(COOKING_HEARTH3_ID)]
    const hookResult = executeCardListener(listener!, {
      state,
      player,
      space: createSpace('improvement'),
      actionId: 'improvement',
      phase: 'after',
      choice: `major:${COOKING_HEARTH3_ID}`,
      result: { type: 'ok' },
      transactionEvents: actionEvents,
      actionEvents,
    } as unknown as CardListenerContext)

    expect(hookResult?.flow).toMatchObject({
      type: 'leaf',
      actionId: 'gain',
      sourceCard: CARD_ID,
      params: { wood: 2, vegetable: 1 },
    })
  })

  it('does not trigger on a pure clay Cooking Hearth purchase', () => {
    const listener = findListener('A41-vegetable-slicer-after-improvement')
    expect(listener).toBeDefined()

    const player = createPlayer()
    player.minorPlayed = [CARD_ID]
    player.resources.clay = 4

    const state = createState(player)
    const result = playImprovement(state, player, `major:${COOKING_HEARTH_ID}`, 'any')

    expect(result.type).toBe('ok')
    const actionEvents = [paidForImprovement(), playedMajor()]
    const hookResult = executeCardListener(listener!, {
      state,
      player,
      space: createSpace('improvement'),
      actionId: 'improvement',
      phase: 'after',
      choice: `major:${COOKING_HEARTH_ID}`,
      result,
      transactionEvents: actionEvents,
      actionEvents,
    } as unknown as CardListenerContext)

    expect(player.improvements).toContain(COOKING_HEARTH_ID)
    expect(hookResult).toBeUndefined()
  })

  it('ignores legacy improvementPayment extraData when returned-card event is missing', () => {
    const listener = findListener('A41-vegetable-slicer-after-improvement')
    expect(listener).toBeDefined()

    const player = createPlayer()
    player.minorPlayed = [CARD_ID]
    const state = createState(player)
    const actionEvents = [playedMajor()]
    const result = {
      type: 'ok',
      extraData: {
        improvementPayment: {
          improvementId: COOKING_HEARTH_ID,
          returnedCardId: FIREPLACE_ID,
        },
      },
    } as ActionExecutionResult

    const hookResult = executeCardListener(listener!, {
      state,
      player,
      space: createSpace('improvement'),
      actionId: 'improvement',
      phase: 'after',
      choice: `major:${COOKING_HEARTH_ID}`,
      result,
      transactionEvents: actionEvents,
      actionEvents,
    } as unknown as CardListenerContext)

    expect(hookResult).toBeUndefined()
  })
})
