import { Occupation } from '../types'
import { registerCardListener } from '../card-listeners'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { incCounter } from '../__stubs__/helpers'
import { payThenActionFlow } from '../helpers/pay-gain-node'

const CARD_ID = 'C96_Merchant'

const immediatelyAfterListener: CardListenerRegistration = {
  id: 'C96-merchant-immediately-after-improvement',
  cardIds: [CARD_ID],
  phases: ['immediatelyAfter' as ActionHookPhase],
  actions: ['improvement-any', 'minor-improvement'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!context.player.occupationPlayed.includes(CARD_ID)) return
    if (context.sourceCard === CARD_ID) return
    incCounter(context.player, CARD_ID, 'triggerCount')
    return payThenActionFlow({
      cardId: CARD_ID,
      cost: { food: 1 },
      promptKey: 'ui.interactionMerchantPrompt',
      action: {
        type: 'leaf',
        actionId: 'improvement-any',
        optional: true,
        promptKey: 'ui.interactionMerchantPrompt',
        sourceCard: CARD_ID,
      },
    })
  },
}

registerCardListener(immediatelyAfterListener)

export const C96_Merchant = new Occupation({
  id: CARD_ID,
  name: "Merchant",
  deck: "C",
  number: 96,
  category: "ACTIONS_BOOSTER",
  desc: ["Immediately after each time you take a __Major or Minor Improvement__ or __Minor Improvement__ action, you can pay 1 <FOOD> to take the action a second time."],
  cost: {},
  players: "1+",
})
