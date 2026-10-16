import { expect } from 'vitest'
import { GameSession, type SessionResponse } from '../../game/authoritative-session'
import { rehydrateState, serializeSessionSnapshot } from '../../../shared/session/serialization'
import { getChoiceOptions } from './session-assertions'

export const choose = (session: GameSession, response: SessionResponse, value: string): SessionResponse => {
  expect(response.ok, response.error).toBe(true)
  if (response.interaction.stateId !== 'wait') throw new Error(`Expected a choice for ${value}`)
  expect(getChoiceOptions(response).some((option) => option.value === value && !option.disabled),
    JSON.stringify(response.interaction)).toBe(true)
  const next = session.resolveChoice(response.interaction.playerIndex, value)
  expect(next.ok, next.error).toBe(true)
  return next
}

export const playOccupation = (session: GameSession, cardId: string, playerIndex = 0): SessionResponse => {
  const response = session.takeAction(playerIndex, 'lessons')
  expect(response.ok, response.error).toBe(true)
  return response.state.players[playerIndex]!.occupationHand.includes(cardId)
    ? choose(session, response, cardId) : response
}

export const playImprovement = (
  session: GameSession, cardId: string, spaceId = 'major-improvement', playerIndex = 0,
): SessionResponse => {
  let response = session.takeAction(playerIndex, spaceId)
  expect(response.ok, response.error).toBe(true)
  const played = () => {
    const player = response.state.players[playerIndex]!
    return player.minorPlayed.includes(cardId) || player.improvements.includes(cardId)
  }
  if (!played() && response.interaction.stateId === 'wait') {
    const branch = getChoiceOptions(response).find((option) => option.value.startsWith('action-improvement-'))
    if (branch) response = choose(session, response, branch.value)
  }
  return played() ? response : choose(session, response, cardId)
}

export const restoreSession = (session: GameSession): GameSession =>
  new GameSession(rehydrateState(JSON.parse(JSON.stringify(serializeSessionSnapshot(session.state, session)))))

export const snapshotResponse = (response: SessionResponse) => structuredClone({
  state: { players: response.state.players, events: response.state.events, log: response.state.log },
  scores: response.scores,
})

export const bonusScore = (response: SessionResponse, cardId: string, playerIndex = 0): number =>
  response.scores?.[playerIndex]?.categories.find((category) => category.key === 'cardBonusVp')
    ?.entries.find((entry) => entry.type === 'bonus' && entry.cardId === cardId)?.score ?? 0
