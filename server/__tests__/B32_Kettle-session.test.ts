import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { confirmNextPlayer } from './_helpers/pending-confirms'

import '../../shared/cards/B/B032_Kettle'

const CARD_ID = 'B032_Kettle'
const FILLER = '__test_placeholder__'

const setup = ({ grainField = true, clay = 1, grain = 0 } = {}) => {
  const session = new GameSession(5232, undefined, { playerCount: 2 })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = 5
  state.roundPhase = 'work'
  state.availableMajorImprovements = []
  state.players.forEach((player) => {
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    setWorkersAtHome(state, player, 2)
  })
  const player = state.players[0]!
  player.minorHand = [CARD_ID]
  player.fields = grainField
    ? [{ row: 0, col: 2, stacks: [{ kind: 'grain', remaining: 1 }] }]
    : []
  player.resources = {
    ...player.resources,
    wood: 0, clay, reed: 0, stone: 0, food: 0, grain, vegetable: 0,
  }
  session.loadState(state)
  return session
}

const enterMinor = (session: GameSession) => {
  let response = session.takeAction(0, 'major-improvement')
  expect(response.ok, response.error).toBe(true)
  if (response.interaction.stateId !== 'wait') return response
  const improvement = response.interaction.request.options?.find((candidate) =>
    candidate.value.startsWith('action-improvement-'))
  if (improvement) response = session.resolveChoice(response.interaction.playerIndex, improvement.value)
  return response
}

const playKettle = (session: GameSession) => {
  let response = enterMinor(session)
  if (!response.state.players[0]!.minorHand.includes(CARD_ID)) return response
  if (response.interaction.stateId !== 'wait') return response
  const card = response.interaction.request.options?.find((candidate) => candidate.value === CARD_ID)
  if (card) response = session.resolveChoice(response.interaction.playerIndex, card.value)
  return response
}

const exchange = (session: GameSession, exchangeIndex: number) => {
  let response = session.takeAnytimeAction(0, 'exchange')
  expect(response.ok, response.error).toBe(true)
  response = session.resolveChoice(0, `bulk:${exchangeIndex}=1`)
  expect(response.ok, response.error).toBe(true)
  return response
}

const returnTurnToKettleOwner = (session: GameSession) => {
  let response = confirmNextPlayer(session)
  expect(response.ok, response.error).toBe(true)
  response = session.takeAction(1, 'forest')
  expect(response.ok, response.error).toBe(true)
  expect(response.interaction.stateId === 'wait' ? response.interaction.request.kind : response.interaction.stateId)
    .toBe('confirm-next-player')
  response = confirmNextPlayer(session)
  expect(response.ok, response.error).toBe(true)
  expect(response.state.currentPlayerIndex).toBe(0)
  return response
}

const bonusVp = (response: SessionResponse) =>
  response.scores[0]!.categories.find((category) => category.key === 'cardBonusVp')?.entries
    .find((entry) => 'cardId' in entry && entry.cardId === CARD_ID)?.score ?? 0

describe('B032 Kettle parity', () => {
  it('B032 S1: one grain field and one clay play Kettle and pay the clay', () => {
    const response = playKettle(setup())

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.clay).toBe(0)
  })

  it('B032 S2: without a grain field Kettle remains unavailable without spending clay', () => {
    const response = setup({ grainField: false }).takeAction(0, 'major-improvement')

    expect(response.ok).toBe(false)
    expect(response.error).toBe('space unavailable')
    expect(response.interaction.stateId).toBe('idle')
    expect(response.state.players[0]!.minorHand).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.clay).toBe(1)
  })

  it('B032 S3: without clay Kettle remains unavailable even with a grain field', () => {
    const response = setup({ clay: 0 }).takeAction(0, 'major-improvement')

    expect(response.ok).toBe(false)
    expect(response.error).toBe('space unavailable')
    expect(response.interaction.stateId).toBe('idle')
    expect(response.state.players[0]!.minorHand).toContain(CARD_ID)
  })

  for (const [scenario, index, grain, food, bonus] of [
    ['S4', 0, 1, 3, 0],
    ['S5', 1, 3, 4, 1],
    ['S6', 2, 5, 5, 2],
  ] as const) {
    it(`B032 ${scenario}: exchanging ${grain} grain yields ${food} food and ${bonus} bonus points`, () => {
      const session = setup({ grain })
      playKettle(session)
      returnTurnToKettleOwner(session)

      const response = exchange(session, index)

      expect(response.state.players[0]!.resources.grain).toBe(0)
      expect(response.state.players[0]!.resources.food).toBe(food)
      expect(bonusVp(response)).toBe(bonus)
    })
  }

  it('B032 S7: bonus points accumulate across separate three- and five-grain exchanges', () => {
    const session = setup({ grain: 8 })
    playKettle(session)
    returnTurnToKettleOwner(session)

    exchange(session, 1)
    const response = exchange(session, 2)

    expect(response.state.players[0]!.resources.grain).toBe(0)
    expect(response.state.players[0]!.resources.food).toBe(9)
    expect(bonusVp(response)).toBe(3)
  })
})
