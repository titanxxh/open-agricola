import type { ActionDefinition } from '../../../contract/types'
import { runCardEffectHook } from '../../../cards/card-effects'
import type { CardEffectHook, PaymentInfo } from '../../../cards/card-effects'

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
    const flow = runCardEffectHook(state, player, cardId, hook as CardEffectHook, paymentInfo)
    if (flow) return { type: 'flow', flow }
    return { type: 'ok' }
  },
}
