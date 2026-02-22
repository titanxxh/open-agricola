import type { ActionExecutionResult, ActionSpace, PlayerState } from '../../game/types'

export const placeFarmer = (
  player: PlayerState,
  space: ActionSpace,
): ActionExecutionResult => {
  if (space.takenBy) {
    return { type: 'ok' }
  }
  space.takenBy = player.id
  player.workersAvailable = Math.max(0, player.workersAvailable - 1)
  return { type: 'ok' }
}
