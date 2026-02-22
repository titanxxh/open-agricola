import type { ActionExecutionResult, GameState, PlayerState } from '../../game/types'

export const activateCard = (
  state: GameState,
  player: PlayerState,
): ActionExecutionResult => {
  void state
  void player
  return { type: 'ok' }
}
