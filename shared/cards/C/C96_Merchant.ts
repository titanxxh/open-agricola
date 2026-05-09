import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { payThenActionFlow } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import { C96_Merchant } from '../../cards-display/C/C96_Merchant'

const CARD_ID = C96_Merchant.id

const immediatelyAfterListener: CardListenerRegistration = {
  id: 'C96-merchant-immediately-after-improvement',
  cardIds: [CARD_ID],
  phases: ['immediatelyAfter' as ActionHookPhase],
  actions: ['improvement-any', 'minor-improvement'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.sourceCard === CARD_ID) return
    if (context.trueAction === false) return
    const secondActionId = context.actionId === 'minor-improvement' ? 'minor-improvement' : 'improvement-any'
    return payThenActionFlow({
      cardId: CARD_ID,
      cost: { food: 1 },
      promptKey: 'ui.interactionMerchantPrompt',
      action: {
        type: 'leaf',
        actionId: secondActionId,
        optional: true,
        promptKey: 'ui.interactionMerchantPrompt',
        sourceCard: CARD_ID,
      },
    })
  },
}

export const C96_Merchant_impl = {
  listeners: [immediatelyAfterListener],
  reaches: [] as readonly string[],
} satisfies CardImpl
