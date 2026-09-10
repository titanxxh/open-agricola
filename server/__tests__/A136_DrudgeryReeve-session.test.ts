import { setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import '../../shared/cards/A/A136_DrudgeryReeve'

import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { requireActiveCardRegistry } from '../../shared/cards/active-registry'
import type { CardEffect } from '../../shared/cards/card-effects'
import type { PlayerState, Resource } from '../../shared/contract/types'
import { computeScores } from '../../shared/domain/scoring'
import { markAllWorkersUsed, setActiveWorkerCount } from '../../shared/domain/player'
import { confirmPlayerSwitch } from './_helpers/pending-confirms'

const CARD_ID = 'A136_DrudgeryReeve'
const RESERVE_FIRST_CARD = 'TEST_A136ReserveFirst'

const setPlaceholderHands = (player: PlayerState) => {
  player.minorHand = ['__test_placeholder__']
  player.occupationHand = ['__test_placeholder__']
}

const setBuildingResources = (player: PlayerState, amount: number) => {
  player.resources.wood = amount
  player.resources.clay = amount
  player.resources.stone = amount
  player.resources.reed = amount
}

const setupEndGameSession = () => {
  const session = new GameSession()
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  state.currentPlayerIndex = 0
  state.round = 14
  state.roundPhase = 'work'
  state.gameOver = false
  state.players.forEach((player) => {
    markAllWorkersUsed(state, player)
    setActiveWorkerCount(player, 0)
    setPlaceholderHands(player)
    player.resources = {
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
    }
    player.occupationPlayed = []
    player.minorPlayed = []
    player.improvements = []
    player.cardStates = {}
  })
  state.players[0]!.occupationPlayed = [CARD_ID]
  session.loadState(state)
  return session
}

const resolveA136TriggerIfPresent = (session: GameSession, resp: SessionResponse, playerIndex: number) => {
  const interaction = resp.interaction
  expect(interaction.stateId).toBe('wait')
  if (interaction.stateId !== 'wait') throw new Error('expected wait')
  expect(interaction.playerIndex).toBe(playerIndex)
  if (interaction.request.kind !== 'select-trigger') return resp
  expect(interaction.request.kind).toBe('select-trigger')
  expect(interaction.request.options).toContainEqual({
    value: CARD_ID,
    labelKey: `cards.${CARD_ID}.name`,
    sourceCard: CARD_ID,
  })
  expect(interaction.request.options).toContainEqual({
    value: '__pass__',
    labelKey: 'ui.interactionSelectTriggerPass',
    disabled: true,
  })
  return session.resolveChoice(playerIndex, CARD_ID)
}

const expectA136Choice = (resp: SessionResponse, playerIndex: number, values: string[]) => {
  const interaction = resp.interaction
  expect(interaction.stateId).toBe('wait')
  if (interaction.stateId !== 'wait') throw new Error('expected wait')
  expect(interaction.playerIndex).toBe(playerIndex)
  expect(interaction.request.kind).toBe('choice')
  if (interaction.request.kind !== 'choice') throw new Error('expected choice')
  expect(interaction.promptKey).toBe('ui.cards.A136_DrudgeryReeve.prompt')
  expect(interaction.request.options.map((option) => option.value)).toEqual(values)
}

const a136Choice = (sets: number) => `${CARD_ID}:sets:${sets}`

describe('A136_DrudgeryReeve before-end shared scoring', () => {
  it('lets each target player choose sets from another player A136 and records reserve without spending resources', () => {
    const session = setupEndGameSession()
    const state = session.getState().state
    setBuildingResources(state.players[0]!, 2)
    setBuildingResources(state.players[1]!, 3)
    session.loadState(state)

    let resp = session.invokeAfterRoundEnd()
    resp = resolveA136TriggerIfPresent(session, resp, 0)
    expectA136Choice(resp, 0, [a136Choice(0), a136Choice(1), a136Choice(2)])

    resp = session.resolveChoice(0, a136Choice(2))
    expect(resp.state.players[0]!.resources.wood).toBe(2)
    expect(resp.state.players[0]!.cardStates[CARD_ID]?.extraData?.scoringReserveBonus).toEqual({
      reserved: { wood: 2, clay: 2, reed: 2, stone: 2 },
      score: 3,
      cardType: 'occupation',
    })
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') throw new Error('expected wait')
    expect(resp.interaction.request.kind).toBe('confirm-player-switch')
    expect(resp.interaction.request.fromPlayerIndex).toBe(0)
    expect(resp.interaction.request.toPlayerIndex).toBe(1)

    resp = confirmPlayerSwitch(session)
    resp = resolveA136TriggerIfPresent(session, resp, 1)
    expectA136Choice(resp, 1, [
      a136Choice(0),
      a136Choice(1),
      a136Choice(2),
      a136Choice(3),
    ])

    resp = session.resolveChoice(1, a136Choice(3))
    expect(resp.state.players[1]!.resources.wood).toBe(3)
    expect(resp.state.players[1]!.cardStates[CARD_ID]?.extraData?.scoringReserveBonus).toEqual({
      reserved: { wood: 3, clay: 3, reed: 3, stone: 3 },
      score: 5,
      cardType: 'occupation',
    })
    expect(resp.state.gameOver).toBe(true)
    expect(resp.interaction.stateId).toBe('gameover')
    expect(resp.interaction.allowedCommands).toEqual([])

    const undoStep = session.undoStep()
    expect(undoStep.ok).toBe(false)
    expect(undoStep.ok ? '' : undoStep.error).toBe('game is over')
    expect(undoStep.state.gameOver).toBe(true)

    const undoAction = session.undoAction()
    expect(undoAction.ok).toBe(false)
    expect(undoAction.ok ? '' : undoAction.error).toBe('game is over')
    expect(undoAction.state.gameOver).toBe(true)

    const scores = computeScores(resp.state)
    const p2Bonus = scores[1]!.categories.find((category) => category.key === 'cardBonusVp')
    expect(p2Bonus).toEqual(expect.objectContaining({
      total: 5,
      entries: [
        {
          type: 'bonus',
          score: 5,
          cardId: CARD_ID,
          cardType: 'occupation',
          reserved: { wood: 3, clay: 3, reed: 3, stone: 3 },
        },
      ],
    }))
  })

  it('skips players with no live sets and records no scoring reserve for choosing zero', () => {
    const session = setupEndGameSession()
    const state = session.getState().state
    setBuildingResources(state.players[0]!, 1)
    setBuildingResources(state.players[1]!, 0)
    session.loadState(state)

    let resp = session.invokeAfterRoundEnd()
    resp = resolveA136TriggerIfPresent(session, resp, 0)
    expectA136Choice(resp, 0, [a136Choice(0), a136Choice(1)])

    resp = session.resolveChoice(0, a136Choice(0))
    expect(resp.state.players[0]!.cardStates[CARD_ID]?.extraData?.scoringReserveBonus).toBeUndefined()
    expect(resp.state.gameOver).toBe(true)
  })

  it('recomputes max sets after another before-end trigger reserves resources first', () => {
    const effect: CardEffect = {
      id: RESERVE_FIRST_CARD,
      onBeforeEndGame: (_state, player) => {
        if ((player.resources.wood ?? 0) <= 0) return
        return {
          type: 'leaf',
          actionId: 'special-effect',
          sourceCard: RESERVE_FIRST_CARD,
          actionContext: { targetPlayerId: player.id },
          params: {
            kind: 'record-scoring-reserve-bonus',
            reserved: { wood: 1, clay: 1, stone: 1, reed: 1 } satisfies Partial<Resource>,
            score: 1,
            cardType: 'occupation',
          },
        }
      },
      beforeEndGameScope: 'allPlayers',
      beforeEndGameMandatory: true,
    }
    const session = setupEndGameSession()
    requireActiveCardRegistry('A136 before-end recompute test').setEffect(effect)
    const state = session.getState().state
    state.players[0]!.occupationPlayed = [RESERVE_FIRST_CARD, CARD_ID]
    setBuildingResources(state.players[0]!, 3)
    setBuildingResources(state.players[1]!, 0)
    session.loadState(state)

    let resp = session.invokeAfterRoundEnd()
    const interaction = resp.interaction
    expect(interaction.stateId).toBe('wait')
    if (interaction.stateId !== 'wait') throw new Error('expected wait')
    expect(interaction.request.kind).toBe('select-trigger')
    if (interaction.request.kind !== 'select-trigger') throw new Error('expected select-trigger')
    expect(interaction.request.options.map((option) => option.value)).toEqual([
      RESERVE_FIRST_CARD,
      CARD_ID,
      '__pass__',
    ])

    resp = session.resolveChoice(0, RESERVE_FIRST_CARD)
    expect(resp.state.players[0]!.cardStates[RESERVE_FIRST_CARD]?.extraData?.scoringReserveBonus)
      .toEqual({
        reserved: { wood: 1, clay: 1, reed: 1, stone: 1 },
        score: 1,
        cardType: 'occupation',
      })

    resp = session.resolveChoice(0, CARD_ID)
    expectA136Choice(resp, 0, [a136Choice(0), a136Choice(1), a136Choice(2)])
  })
})

describe('A136 Drudgery Reeve parity', () => {
  const CARD_ID = 'A136_DrudgeryReeve'

  const FILLER = '__test_placeholder__'

  const setup = ({ round = 14, played = false } = {}) => {
    const session = new GameSession(6136 + round, undefined, { playerCount: 3 })
    const state = session.getState().state
    stabilizeRandomHands(state.players)
    state.currentPlayerIndex = 0
    state.round = round
    state.roundPhase = 'work'
    state.gameOver = false
    state.players.forEach((player) => {
      setWorkersAtHome(state, player, 2)
      player.minorHand = [FILLER]
      player.occupationHand = [FILLER]
      player.minorPlayed = []
      player.occupationPlayed = []
      player.cardStates = {}
      player.resources = {
        wood: 0, clay: 0, reed: 0, stone: 0, food: 0, grain: 0, vegetable: 0,
        sheep: 0, boar: 0, cattle: 0, begging: 0,
      }
    })
    const owner = state.players[0]!
    owner.occupationHand = played ? [FILLER] : [CARD_ID]
    owner.occupationPlayed = played ? [CARD_ID] : []
    session.loadState(state)
    return session
  }

  const playOccupation = (session: GameSession) => {
    const response = session.takeAction(0, 'lessons')
    if (!response.state.players[0]!.occupationHand.includes(CARD_ID)) return response
    if (response.interaction.stateId !== 'wait') return response
    const option = response.interaction.request.options?.find((candidate) => candidate.value === CARD_ID)
    expect(option).toBeDefined()
    return session.resolveChoice(response.interaction.playerIndex, option!.value)
  }

  it.each([
    { scenario: 'S1', round: 5, wood: 4 },
    { scenario: 'S2', round: 8, wood: 3 },
    { scenario: 'S3', round: 11, wood: 2 },
    { scenario: 'S4', round: 13, wood: 1 },
    { scenario: 'S5', round: 14, wood: 0 },
  ])('A136 $scenario: playing with the corresponding complete rounds left gains $wood wood',
    ({ round, wood }) => {
      const response = playOccupation(setup({ round }))

      expect(response.ok, response.error).toBe(true)
      expect(response.state.players[0]!.occupationPlayed).toContain(CARD_ID)
      expect(response.state.players[0]!.resources.wood).toBe(wood)
    })
})
