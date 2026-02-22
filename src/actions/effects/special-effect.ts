import type { ActionExecutionResult, GameState, PlayerState } from '../../game/types'

export const specialEffect = (
  state: GameState,
  player: PlayerState,
): ActionExecutionResult => {
  void state
  void player
  return { type: 'ok' }
}
