import { expect } from 'vitest'
import type { GameSession, SessionResponse } from '../../game/authoritative-session'

/** Declines only the upstream post-reap exchange opportunity. */
export const enterFeeding = (session: GameSession): SessionResponse => {
  let response = session.performRoundEnd()
  while (response.interaction.stateId === 'wait'
    && session.peekEnginePendingEnvelope()?.syntheticKind === 'post-reap-anytime') {
    response = session.resolveChoice(response.interaction.playerIndex, '__skip__')
    expect(response.ok, response.error).toBe(true)
  }
  return response
}
