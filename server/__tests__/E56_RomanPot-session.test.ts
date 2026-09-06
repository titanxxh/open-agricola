import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { markAllWorkersUsed, setWorkersAtHome } from '../../shared/domain/player'
import { readCardExtraData, writeCardExtraData, writeCardInfobox } from '../../shared/cards/helpers/card-state'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import '../../shared/cards/E/E056_RomanPot'

const CARD_ID = 'E056_RomanPot'
const FILLER = '__test_placeholder__'

const setup = ({
  played = false, clay = 1, food = 20, firstPlayerIndex = 1, round = 1, cardFood = 4,
} = {}) => {
  const session = new GameSession(7056, undefined, { playerCount: 3 })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = round
  state.roundPhase = 'work'
  state.availableMajorImprovements = []
  state.actionSpaces.forEach((space) => { space.takenBy = [] })
  state.players.forEach((player, index) => {
    player.startPlayer = index === firstPlayerIndex
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    player.minorPlayed = []
    player.occupationPlayed = []
    player.improvements = []
    player.cardStates = {}
    player.resources = {
      ...player.resources,
      wood: 0, clay: index === 0 ? clay : 0, reed: 0, stone: 0, food: index === 0 ? food : 20,
      grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0,
    }
    setWorkersAtHome(state, player, index === 0 ? 2 : 0)
  })
  const owner = state.players[0]!
  owner.minorHand = played ? [FILLER] : [CARD_ID, FILLER]
  if (played) {
    owner.minorPlayed = [CARD_ID]
    writeCardExtraData(owner, CARD_ID, 'foodCount', cardFood)
    writeCardInfobox(owner, CARD_ID, `${cardFood} Food`)
  }
  state.roundFirstPlayerId = state.players[firstPlayerIndex]!.id
  session.loadState(state)
  return session
}

const enterMinor = (session: GameSession) => {
  let response = session.takeAction(0, 'major-improvement')
  if (response.interaction.stateId !== 'wait') return response
  if (!response.interaction.request.options?.some((option) => option.value === CARD_ID)) {
    const branch = response.interaction.request.options?.find((option) =>
      option.value.startsWith('action-improvement-'))
    if (branch) response = session.resolveChoice(response.interaction.playerIndex, branch.value)
  }
  return response
}

const play = (session: GameSession) => {
  let response = enterMinor(session)
  if (!response.state.players[0]!.minorHand.includes(CARD_ID)) return response
  if (response.interaction.stateId !== 'wait') return response
  const card = response.interaction.request.options?.find((option) => option.value === CARD_ID)
  if (card) response = session.resolveChoice(response.interaction.playerIndex, card.value)
  return response
}

const offered = (response: SessionResponse) => response.interaction.stateId === 'wait'
  && (response.interaction.request.options?.some((option) => option.value === CARD_ID) ?? false)

const cardFood = (response: SessionResponse) =>
  readCardExtraData<number>(response.state.players[0]!, CARD_ID, 'foodCount') ?? 0

const finishRound = (session: GameSession) => {
  const state = session.getState().state
  state.players.forEach((player) => {
    markAllWorkersUsed(state, player)
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
  })
  session.loadState(state)
  return session.performRoundEnd()
}

describe('E056 Roman Pot parity', () => {
  it('E056 S1: paying one clay plays Roman Pot and places four food on it', () => {
    const response = play(setup())

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.clay).toBe(0)
    expect(cardFood(response)).toBe(4)
  })

  it('E056 S2: without one clay Roman Pot is unavailable', () => {
    const response = enterMinor(setup({ clay: 0 }))

    expect(offered(response)).toBe(false)
    expect(response.state.players[0]!.minorHand).toContain(CARD_ID)
    expect(cardFood(response)).toBe(0)
  })

  it('E056 S3: the last player in cyclic turn order receives one food at work phase start', () => {
    const response = finishRound(setup({ played: true, firstPlayerIndex: 1 }))

    expect(response.state.round).toBe(2)
    expect(response.state.players[0]!.resources.food).toBe(21)
    expect(cardFood(response)).toBe(3)
  })

  it('E056 S4: a Roman Pot owner who is not last in turn order receives no food', () => {
    const response = finishRound(setup({ played: true, firstPlayerIndex: 0 }))

    expect(response.state.round).toBe(2)
    expect(response.state.players[0]!.resources.food).toBe(20)
    expect(cardFood(response)).toBe(4)
  })

  it('E056 S5: an empty Roman Pot gives no further food even to the last player', () => {
    const response = finishRound(setup({ played: true, firstPlayerIndex: 1, cardFood: 0 }))

    expect(response.state.players[0]!.resources.food).toBe(20)
    expect(cardFood(response)).toBe(0)
  })

  it('E056 S6: Roman Pot can release exactly four food across eligible work phase starts', () => {
    for (const remaining of [4, 3, 2, 1, 0]) {
      const response = finishRound(setup({
        played: true, firstPlayerIndex: 1, cardFood: remaining,
      }))
      expect(response.state.players[0]!.resources.food).toBe(remaining > 0 ? 21 : 20)
      expect(cardFood(response)).toBe(Math.max(remaining - 1, 0))
    }
  })

  it('E056 S7: Roman Pot contributes its printed one point at scoring', () => {
    const response = play(setup())
    const cardEntry = response.scores?.[0]?.categories
      .find((category) => category.key === 'cards')?.entries
      .find((entry) => entry.cardId === CARD_ID)

    expect(cardEntry?.score).toBe(1)
  })
})
