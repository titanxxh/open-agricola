import type { ActionExecutionResult, PlayerState } from '../../game/types'
import { activateSmallestInactive } from '../../game/player'

export const placeFutureMeeples = (
  player: PlayerState,
  count = 1,
): ActionExecutionResult => {
  if (count <= 0) {
    return { type: 'ok' }
  }
  for (let i = 0; i < count; i += 1) {
    if (!activateSmallestInactive(player)) break
  }
  return { type: 'ok' }
}
