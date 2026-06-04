import { defineOccupationCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { readImprovementTypes } from '../../actions/effects/improvement'
import { payThenActionFlow } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'C96_Merchant'
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
        ...(secondTypes ? { actionContext: { types: secondTypes } } : {}),
      },
    })
  },
}

const cardImpl = {
  listeners: [immediatelyAfterListener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const C96_Merchant = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: "Merchant",
    deck: "C",
    number: 96,
    category: "ACTIONS_BOOSTER",
    desc: ["Immediately after each time you take a __Major or Minor Improvement__ or __Minor Improvement__ action, you can pay 1 <FOOD> to take the action a second time."],
    cost: {},
    players: "1+",
  },
  impl: cardImpl,
})

export const C96_Merchant_impl = C96_Merchant.impl
