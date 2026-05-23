import type { ActionDefinition, ActionExecutionResult, GameState, PlayerState } from '../../../contract/types'
import { runCardEffectHook } from '../../../cards/card-effects'
import type { CardEffectHook, PaymentInfo } from '../../../cards/card-effects'

export const activateCardEffect = (
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

export const activateCardEffectAction: ActionDefinition = {
  id: 'activate-card-effect',
  nameKey: 'actions.activate-card-effect.name',
  descriptionKey: 'actions.activate-card-effect.description',
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: () => true,
  execute: ({ state, player, params, actionContext }) => {
    const cardId = params?.cardId
    const hook = params?.hook
    if (typeof cardId !== 'string' || typeof hook !== 'string') {
      return { type: 'fail', errorKey: 'log.cardEffectFail' }
    }
    const paymentInfo = actionContext?.paymentInfo as PaymentInfo | undefined
    return activateCardEffect(state, player, cardId, hook as CardEffectHook, paymentInfo)
  },
}
