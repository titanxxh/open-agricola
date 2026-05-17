import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { readImprovementTypes } from '../../actions/effects/improvement'
import { payThenActionFlow } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import { C96_Merchant } from '../../cards-display/C/C96_Merchant'

const CARD_ID = C96_Merchant.id

const immediatelyAfterListener: CardListenerRegistration = {
  id: 'C96-merchant-immediately-after-improvement',
  cardIds: [CARD_ID],
  phases: ['immediatelyAfter' as ActionHookPhase],
  actions: ['improvement'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.sourceCard === CARD_ID) return
    if (context.trueAction === false) return
    const types = readImprovementTypes(context)
    const secondTypes = types.length === 1 && types[0] === 'minor' ? ['minor'] : undefined
    return payThenActionFlow({
      cardId: CARD_ID,
      cost: { food: 1 },
      promptKey: 'ui.interactionMerchantPrompt',
      action: {
        type: 'leaf',
        actionId: 'improvement',
        optional: true,
        promptKey: 'ui.interactionMerchantPrompt',
        sourceCard: CARD_ID,
        ...(secondTypes ? { params: { types: secondTypes } } : {}),
      },
    })
  },
}

export const C96_Merchant_impl = {
  listeners: [immediatelyAfterListener],
  reaches: [] as readonly string[],
} satisfies CardImpl
