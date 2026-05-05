import type { GameSession } from '../../game/authoritative-session'
import type { SessionResponse } from '../../../shared/session/session-core'

/**
 * Test helper: drive the synthetic `confirm-next-player` InteractionNode
 * forward by reading the current `nextPlayerIndex` off the active
 * `InteractionState.request` and resolving via `resolveChoice`. Replaces
 * the deprecated `GameSession.confirmNextPlayer()` shim (deleted in S2 Task
 * 13.7 part 2).
 */
export function confirmNextPlayer(session: GameSession): SessionResponse {
  const interaction = session.getState().interaction
  if (interaction.stateId !== 'wait' || interaction.request?.kind !== 'confirm-next-player') {
    return session.resolveChoice(0, 'confirm')
  }
  return session.resolveChoice(interaction.request.nextPlayerIndex, 'confirm')
}

/**
 * Test helper: drive the synthetic `confirm-player-switch` InteractionNode
 * forward by reading the current `toPlayerIndex` off the active
 * `InteractionState.request` and resolving via `resolveChoice`. Replaces
 * the deprecated `GameSession.confirmPlayerSwitch()` shim (deleted in S2
 * Task 13.7 part 2).
 */
export function confirmPlayerSwitch(session: GameSession): SessionResponse {
  const interaction = session.getState().interaction
  if (interaction.stateId !== 'wait' || interaction.request?.kind !== 'confirm-player-switch') {
    return session.resolveChoice(0, 'confirm')
  }
  return session.resolveChoice(interaction.request.toPlayerIndex, 'confirm')
}
