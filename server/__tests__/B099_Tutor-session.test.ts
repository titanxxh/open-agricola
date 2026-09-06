import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { computeScores } from '../../shared/domain/scoring'
import { setWorkersAtHome } from '../../shared/domain/player'
import { readCardExtraData } from '../../shared/cards/helpers/card-state'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { confirmNextPlayer } from './_helpers/pending-confirms'

import '../../shared/cards/A/A116_WoodCutter'
import '../../shared/cards/B/B099_Tutor'
import '../../shared/cards/B/B121_Geologist'

const CARD_ID = 'B099_Tutor'
const BEFORE = 'B121_Geologist'
const AFTER = 'A116_WoodCutter'
const FILLER = '__test_placeholder__'

const setup = ({ previousOccupation = false, laterOccupation = false } = {}) => {
  const session = new GameSession(5099, undefined, { playerCount: 4 })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = 5
  state.roundPhase = 'work'
  state.players.forEach((player) => {
    setWorkersAtHome(state, player, 2)
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    player.resources.food = 20
  })
  const owner = state.players[0]!
  owner.occupationPlayed = previousOccupation ? [BEFORE] : []
  owner.occupationHand = laterOccupation ? [CARD_ID, AFTER] : [CARD_ID]
  session.loadState(state)
  return session
}

const playOccupation = (session: GameSession, playerIndex: number, actionId: string, cardId: string) => {
  const response = session.takeAction(playerIndex, actionId)
  expect(response.ok, response.error).toBe(true)
  if (!response.state.players[playerIndex]!.occupationHand.includes(cardId)) return response
  expect(response.interaction.stateId).toBe('wait')
  if (response.interaction.stateId !== 'wait') return response
  const option = response.interaction.request.options?.find((candidate) => candidate.value === cardId)
  expect(option, JSON.stringify(response.interaction)).toBeDefined()
  return session.resolveChoice(response.interaction.playerIndex, option!.value)
}

const takeTurn = (session: GameSession, playerIndex: number, actionId: string) => {
  let response = confirmNextPlayer(session)
  expect(response.ok, response.error).toBe(true)
  expect(response.state.currentPlayerIndex).toBe(playerIndex)
  response = session.takeAction(playerIndex, actionId)
  expect(response.ok, response.error).toBe(true)
  return response
}

const returnTurnToOwner = (session: GameSession) => {
  takeTurn(session, 1, 'forest')
  takeTurn(session, 2, 'clay-pit')
  takeTurn(session, 3, 'reed-bank')
  const response = confirmNextPlayer(session)
  expect(response.ok, response.error).toBe(true)
  expect(response.state.currentPlayerIndex).toBe(0)
  return response
}

const tutorBonus = (response: SessionResponse) =>
  computeScores(response.state)[0]!.categories
    .find((category) => category.key === 'cardBonusVp')?.entries
    .find((entry) => 'cardId' in entry && entry.cardId === CARD_ID)?.score ?? 0

describe('B099 Tutor parity', () => {
  it('B099 S1: playing Tutor through Lessons records the current occupation count', () => {
    const response = playOccupation(setup({ previousOccupation: true }), 0, 'lessons', CARD_ID)

    expect(response.state.players[0]!.occupationPlayed).toEqual([BEFORE, CARD_ID])
    expect(readCardExtraData<number>(response.state.players[0]!, CARD_ID, 'playedAtCount')).toBe(2)
  })

  it('B099 S2: one occupation played after Tutor scores one point while an earlier occupation is ignored', () => {
    const session = setup({ previousOccupation: true, laterOccupation: true })
    playOccupation(session, 0, 'lessons', CARD_ID)
    returnTurnToOwner(session)

    const response = playOccupation(session, 0, 'lessons-4', AFTER)

    expect(response.state.players[0]!.occupationPlayed).toEqual([BEFORE, CARD_ID, AFTER])
    expect(tutorBonus(response)).toBe(1)
  })

  it('B099 S3: Tutor scores zero when no occupation is played after it', () => {
    const response = playOccupation(setup({ previousOccupation: true }), 0, 'lessons', CARD_ID)

    expect(tutorBonus(response)).toBe(0)
  })
})
