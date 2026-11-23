import { expect } from 'vitest'
import type { GameSession, SessionResponse } from '../../game/authoritative-session'
import type { GameState } from '../../../shared/contract/types'

type WaitResponse = SessionResponse & {
  interaction: Extract<SessionResponse['interaction'], { stateId: 'wait' }>
}

export const expectWait = (resp: SessionResponse): WaitResponse => {
  expect(resp.ok).toBe(true)
  expect(resp.interaction.stateId).toBe('wait')
  if (resp.interaction.stateId !== 'wait') {
    throw new Error(`expected wait, got ${resp.interaction.stateId}`)
  }
  return resp as WaitResponse
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
  expect(option?.disabled).not.toBe(true)
  return session.resolveChoice(resp.interaction.playerIndex, option!.value)
}

export const resolveNonSkipChoice = (
  session: GameSession,
  resp: SessionResponse,
): SessionResponse => {
  const wait = expectWait(resp)
  expect(['choice', 'select-trigger']).toContain(wait.interaction.request.kind)
  const option = wait.interaction.request.options?.find((candidate) => !candidate.disabled
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
  const option = wait.interaction.request.options?.find((candidate) => !candidate.disabled
    && candidate.value === (wait.interaction.request.kind === 'select-trigger' ? '__pass__' : '__skip__'))
  expect(option).toBeDefined()
  return session.resolveChoice(wait.interaction.playerIndex, option!.value)
}

/**
 * Every seat orders its same-timing reactions itself (#2039: the auto-resolve
 * setting off), so a test can choose each order, including independent sources.
 */
export const orderReactionsManually = (state: Pick<GameState, 'players'>): void => {
  for (const player of state.players) player.preferences = { autoResolveIndependentReactions: false }
}

/** Fixture options whose `configure` first makes every seat order reactions itself. */
export const withManualReactionOrder = <T extends { configure?: (state: GameState) => void }>(options: T): T => ({
  ...options,
  configure: (state: GameState) => {
    orderReactionsManually(state)
    options.configure?.(state)
  },
})
