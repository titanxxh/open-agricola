import type { GameSession } from '../../game/authoritative-session'
import type { SessionResponse } from '../../../shared/session/session-core'

/**
 * Test helper: drive synthetic confirm pending frames through the public
 * resolveChoice API by reading the active InteractionState.request.
 */
export function confirmNextPlayer(session: GameSession): SessionResponse {
  const interaction = session.getState().interaction
  if (interaction.stateId !== 'wait' || interaction.request?.kind !== 'confirm-next-player') {
    return session.resolveChoice(0, 'confirm')
  }
  return session.resolveChoice(interaction.request.nextPlayerIndex, 'confirm')
}

export function confirmPlayerSwitch(session: GameSession): SessionResponse {
  const interaction = session.getState().interaction
  if (interaction.stateId !== 'wait' || interaction.request?.kind !== 'confirm-player-switch') {
    return session.resolveChoice(0, 'confirm')
  }
  return session.resolveChoice(interaction.request.fromPlayerIndex, 'confirm')
}
