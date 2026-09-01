import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { executeCardListener, getRegisteredCardListeners, type CardListenerContext } from '../../shared/cards/card-listeners'
import { playImprovement } from '../../shared/actions/effects/improvement'
import type { DraftGameEvent } from '../../shared/contract/events'
import type { ActionExecutionResult, ActionSpace, GameState, PlayerState } from '../../shared/contract/types'
import { setWorkersAtHome } from '../../shared/domain/player'

import '../../shared/cards/A/A041_VegetableSlicer'
import '../../shared/cards/A/A060_OrientalFireplace'

const CARD_ID = 'A041_VegetableSlicer'
const FIREPLACE_ID = 'Major_Fireplace1'
const COOKING_HEARTH_ID = 'Major_CookingHearth1'
const FIREPLACE3_ID = 'Major_Fireplace3'
const COOKING_HEARTH3_ID = 'Major_CookingHearth3'
const ORIENTAL_FIREPLACE_ID = 'A060_OrientalFireplace'
const FIXED_HANDS = [
  { occupation: 'A116_WoodCutter', minor: 'A004_Baseboards' },
  { occupation: 'B116_Shoreforester', minor: 'B003_Moonshine' },
]

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

describe('A041_VegetableSlicer improvement listener', () => {
  it('A041 S2: returning a major Fireplace for a Cooking Hearth grants two wood and one vegetable', () => {
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
    player.minorHand = [FIXED_HANDS[0]!.minor]
    player.occupationHand = [FIXED_HANDS[0]!.occupation]

    state.players[1]!.minorHand = [FIXED_HANDS[1]!.minor]
    state.players[1]!.occupationHand = [FIXED_HANDS[1]!.occupation]
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

const improvementSession = ({ returnedCard, clay = 0 }: { returnedCard?: string; clay?: number }) => {
  const session = new GameSession(41, undefined, { playerCount: 2 })
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.roundPhase = 'work'
  state.availableMajorImprovements = [COOKING_HEARTH_ID]
  state.players.forEach((player, index) => {
    setWorkersAtHome(state, player, 1)
    player.minorHand = [FIXED_HANDS[index]!.minor]
    player.occupationHand = [FIXED_HANDS[index]!.occupation]
  })
  const player = state.players[0]!
  player.minorPlayed = [CARD_ID]
  if (returnedCard === ORIENTAL_FIREPLACE_ID) player.minorPlayed.push(returnedCard)
  else if (returnedCard) player.improvements = [returnedCard]
  player.resources = { ...player.resources, clay, wood: 0, vegetable: 0 }
  session.loadState(state)
  return session
}

const playA41 = () => {
  const session = new GameSession(41, undefined, { playerCount: 2 })
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.roundPhase = 'work'
  state.players.forEach((player, index) => {
    setWorkersAtHome(state, player, 1)
    player.minorHand = [FIXED_HANDS[index]!.minor]
    player.occupationHand = [FIXED_HANDS[index]!.occupation]
  })
  state.players[0]!.minorHand = [CARD_ID]
  state.players[0]!.resources.wood = 1
  state.players[0]!.resources.vegetable = 0
  session.loadState(state)

  let resp = session.takeAction(0, 'meeting-place')
  expect(resp.ok).toBe(true)
  if (resp.interaction.stateId !== 'wait') return resp
  const improvementOption = resp.interaction.request.options?.find((option) => option.value.startsWith('action-improvement-'))
  if (improvementOption) resp = session.resolveChoice(0, improvementOption.value)
  if (resp.state.players[0]!.minorPlayed.includes(CARD_ID)) return resp
  expect(resp.interaction.stateId).toBe('wait')
  if (resp.interaction.stateId !== 'wait') return resp
  const cardOption = resp.interaction.request.options?.find((option) => option.value === CARD_ID)
  expect(cardOption).toBeDefined()
  return session.resolveChoice(0, cardOption!.value)
}

const buyCookingHearth = (session: GameSession) => {
  const resp = session.takeAction(0, 'major-improvement')
  if (resp.state.players[0]!.improvements.includes(COOKING_HEARTH_ID)) return resp
  expect(resp.interaction.stateId).toBe('wait')
  if (resp.interaction.stateId !== 'wait') return resp
  const option = resp.interaction.request.options?.find((entry) => entry.value === COOKING_HEARTH_ID)
  expect(option).toBeDefined()
  return session.resolveChoice(0, option!.value)
}

describe('A041 parity batch-02 characterization', () => {
  it('A041 S1: playing Vegetable Slicer costs one wood and grants no retroactive reward', () => {
    const resp = playA41()

    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.minorPlayed).toContain(CARD_ID)
    expect(resp.state.players[0]!.resources.wood).toBe(0)
    expect(resp.state.players[0]!.resources.vegetable).toBe(0)
  })

  it('A041 S3: buying a Cooking Hearth with clay grants no Vegetable Slicer reward', () => {
    const resp = buyCookingHearth(improvementSession({ clay: 4 }))

    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.improvements).toContain(COOKING_HEARTH_ID)
    expect(resp.state.players[0]!.resources).toMatchObject({ clay: 0, wood: 0, vegetable: 0 })
  })

  it('A041 S4: OA upgrades Oriental Fireplace but grants no Vegetable Slicer reward', () => {
    const resp = buyCookingHearth(improvementSession({ returnedCard: ORIENTAL_FIREPLACE_ID }))

    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.improvements).toContain(COOKING_HEARTH_ID)
    expect(resp.state.players[0]!.minorPlayed).not.toContain(ORIENTAL_FIREPLACE_ID)
    expect(resp.state.players[0]!.resources).toMatchObject({ wood: 0, vegetable: 0 })
  })
})
