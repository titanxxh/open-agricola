import type { ActionExecutionResult, PlayerState } from '../../game/types'

export const reorganize = (player: PlayerState): ActionExecutionResult => {
  void player
  return { type: 'ok' }
}
