import type { GameSession } from '../../game/authoritative-session'
import type { SessionResponse } from '../../../shared/session/session-core'

/**
 * Test helper: drive the synthetic `confirm-next-player` pending frame
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
 * Test helper: drive the synthetic `confirm-player-switch` pending frame
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

/**
 * Test helper: legacy `PendingAction.type === 'choice'` predicate. The
 * deprecated `'choice'` PendingAction collapses four `InteractionRequest`
 * kinds — `choice`, `animal-reorg`, `farm-select`, `selection` — plus the
 * composite-fallback path. Tests asserting "still in (any) player-choice
 * pending" should use this; assertions wanting strict 'choice' kind only
 * should read `interaction.request.kind === 'choice'` directly.
 */
export function isLegacyChoicePending(resp: SessionResponse): boolean {
  if (resp.interaction.stateId !== 'wait') return false
  const kind = resp.interaction.request?.kind
  return (
    kind === 'choice' ||
    kind === 'animal-reorg' ||
    kind === 'farm-select' ||
    kind === 'selection'
  )
}
