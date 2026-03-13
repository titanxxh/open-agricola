import type { ActionExecutionResult, GameState, PlayerState } from '../../game/types'
import { runCardEffectHook } from '../../cards/card-effects'
import type { CardEffectHook, PaymentInfo } from '../../cards/card-effects'

export const activateCard = (
  state: GameState,
  player: PlayerState,
  cardId: string,
  hook: CardEffectHook,
  paymentInfo?: PaymentInfo,
): ActionExecutionResult => {
  const flow = runCardEffectHook(state, player, cardId, hook, paymentInfo)
  if (flow) return { type: 'flow', flow }
  return { type: 'ok' }
}
