import type { ActionExecutionResult, PlayerState } from '../../game/types'

export const placeFutureMeeples = (
  player: PlayerState,
  count = 1,
): ActionExecutionResult => {
  if (count <= 0) {
    return { type: 'ok' }
  }
  player.familySize += count
  player.workersAvailable += count
  return { type: 'ok' }
}
