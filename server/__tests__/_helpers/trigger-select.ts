import { expect } from 'vitest'
import type { GameSession, SessionResponse } from '../../game/authoritative-session'
import { getChoiceOptions } from './session-assertions'

type WaitResponse = SessionResponse & {
  interaction: Extract<SessionResponse['interaction'], { stateId: 'wait' }>
}

export const expectWait = (resp: SessionResponse): WaitResponse => {
  expect(resp.ok).toBe(true)
  expect(resp.interaction.stateId).toBe('wait')
  if (resp.interaction.stateId !== 'wait') {
    throw new Error(`expected wait, got ${resp.interaction.stateId}`)
  }
  return { ...resp, interaction: resp.interaction }
}

export const resolveTriggerIfPresent = (
  session: GameSession,
  resp: SessionResponse,
  sourceCard: string,
): SessionResponse => {
  if (resp.interaction.stateId !== 'wait' || resp.interaction.request.kind !== 'select-trigger') {
    return resp
  }
  const option = resp.interaction.request.options?.find((candidate) =>
    candidate.value === sourceCard || candidate.sourceCard === sourceCard,
  )
  expect(option).toBeDefined()
  return session.resolveChoice(resp.interaction.playerIndex, option!.value)
}

export const resolveNonSkipChoice = (
  session: GameSession,
  resp: SessionResponse,
): SessionResponse => {
  const wait = expectWait(resp)
  expect(['choice', 'select-trigger']).toContain(wait.interaction.request.kind)
  const option = getChoiceOptions(wait).find((candidate) => !candidate.disabled
    && candidate.value !== '__skip__' && candidate.value !== '__pass__')
  expect(option).toBeDefined()
  return session.resolveChoice(wait.interaction.playerIndex, option!.value)
}

export const resolveSkipChoice = (
  session: GameSession,
  resp: SessionResponse,
): SessionResponse => {
  const wait = expectWait(resp)
  expect(['choice', 'select-trigger']).toContain(wait.interaction.request.kind)
  const option = getChoiceOptions(wait).find((candidate) => !candidate.disabled
    && candidate.value === (wait.interaction.request.kind === 'select-trigger' ? '__pass__' : '__skip__'))
  expect(option).toBeDefined()
  return session.resolveChoice(wait.interaction.playerIndex, option!.value)
}
