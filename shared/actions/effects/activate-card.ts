import type { ActionExecutionResult, GameState, PlayerState } from '../../game/types'
import { runCardEffectHook } from '../../cards/card-effects'
import type { CardEffectHook } from '../../cards/card-effects'

export const activateCard = (
  state: GameState,
  player: PlayerState,
  cardId: string,
  hook: CardEffectHook,
): ActionExecutionResult => {
  const flow = runCardEffectHook(state, player, cardId, hook)
  if (flow) return { type: 'flow', flow }
  return { type: 'ok' }
}
