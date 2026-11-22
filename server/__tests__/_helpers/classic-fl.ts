import { expect } from 'vitest'
import { getClassicCardsByDeckNumber } from '../../../shared/cards/classic-catalog'
import type { GameState } from '../../../shared/contract/types'
import type { GameSession, SessionResponse } from '../../game/authoritative-session'
import { createWorkSession } from './session-fixtures'
import { choose } from './card-play-lifecycle'

export function flCard(number: number) {
  const [card] = getClassicCardsByDeckNumber('CFL', number)
  if (!card) throw new Error(`Missing FL card ${number}`)
  return card
}

export function flSession(configure: (state: GameState) => void): GameSession {
  return createWorkSession({ seed: 6100, options: { playerCount: 4 }, configure })
}

export function confirmTurns(session: GameSession, response: SessionResponse): SessionResponse {
  let current = response
  for (let index = 0; index < 8; index++) {
    expect(current.ok, current.error).toBe(true)
    if (
      current.interaction.stateId !== 'wait' ||
      !['confirm-next-player', 'confirm-player-switch'].includes(current.interaction.request.kind)
    )
      return current
    current = session.resolveChoice(current.interaction.playerIndex, 'confirm')
  }
  throw new Error('Unexpected confirmation loop')
}

export function chooseBranch(
  session: GameSession,
  response: SessionResponse,
  index = 0,
): SessionResponse {
  if (response.interaction.stateId !== 'wait')
    throw new Error(`Expected choice, got ${JSON.stringify(response.interaction)}`)
  const option = flOptions(response).filter(
    (entry) => !entry.disabled && entry.value !== '__skip__',
  )[index]
  if (!option) throw new Error(`Missing choice ${index}: ${JSON.stringify(response.interaction)}`)
  return choose(session, response, option.value)
}

export function takeFlAnytime(
  session: GameSession,
  number: number,
  suffix: string,
): SessionResponse {
  const response = session.takeAnytimeAction(0, `${flCard(number).id}-${suffix}`)
  expect(response.ok, `${number}: ${response.error}`).toBe(true)
  return response
}

export const flOptions = (response: SessionResponse) =>
  response.interaction.stateId === 'wait' && response.interaction.request.kind === 'choice'
    ? response.interaction.request.options
    : []
