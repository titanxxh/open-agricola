import type { GameState, PlayerState } from '../../contract/types'
import { removeWorkerRef } from '../../game/space'
import { holdWorkerOnCard } from './card-held-workers'

type RecallOptions = {
  /** Park the recalled worker on this card instead of returning it home. */
  targetCardHold?: string
}

/**
 * Recall a specific worker (identified by workerId) back home — or onto a
 * holding card if `options.targetCardHold` is set. Returns `true` when the
 * worker was found and recalled, `false` otherwise.
 *
 * Card listeners typically resolve the workerId via
 * `getRoundPlacementDetails(player)` or by inspecting `space.takenBy`, then
 * pass it here. Because a single space may host more than one of the player's
 * workers, identifying by workerId is unambiguous.
 *
 * Used by:
 * - `recall-placed-worker` ActionDefinition (engine-driven leaf path).
 * - Cards whose onBuy / onHook directly mutates state (E3_TeaTime).
 */
export const recallWorkerById = (
  state: GameState,
  player: PlayerState,
  workerId: string,
  options?: RecallOptions,
): boolean => {
  const space = state.actionSpaces.find((s) =>
    s.takenBy.some((t) => t.playerId === player.id && t.workerId === workerId),
  )
  if (!space) return false
  const removed = removeWorkerRef(space, player.id, workerId)
  if (!removed) return false
  if (options?.targetCardHold) {
    holdWorkerOnCard(player, options.targetCardHold, removed.workerId)
  }
  return true
}
