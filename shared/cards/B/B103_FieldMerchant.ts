import { Occupation } from '../types'
import { registerCardListener } from '../card-listeners'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { incCounter } from '../__stubs__/helpers'

const CARD_ID = 'B103_FieldMerchant'

const isDoableListener: CardListenerRegistration = {
  id: 'B103-field-merchant-isdoable-improvement',
  cardIds: [CARD_ID],
  phases: ['isDoable' as ActionHookPhase],
  actions: ['improvement-any', 'minor-improvement'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!context.player.occupationPlayed.includes(CARD_ID)) return
    return context.doable ? undefined : { doable: true }
  },
}

const computeReplaceListener: CardListenerRegistration = {
  id: 'B103-field-merchant-replace-improvement',
  cardIds: [CARD_ID],
  phases: ['computeReplace' as ActionHookPhase],
  actions: ['improvement-any', 'minor-improvement'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!context.player.occupationPlayed.includes(CARD_ID)) return
    incCounter(context.player, CARD_ID, 'triggerCount')
    const children = context.actionId === 'minor-improvement'
      ? [{ type: 'leaf' as const, actionId: 'gain', params: { food: 1 } }]
      : [
          { type: 'leaf' as const, actionId: 'gain', params: { food: 1 } },
          { type: 'leaf' as const, actionId: 'gain', params: { vegetable: 1 } },
        ]
    return {
      decline: true,
      alternativeFlow: {
        type: 'xor',
        promptKey: 'ui.interactionFieldMerchantChoose',
        children,
      },
    }
  },
}

registerCardListener(isDoableListener)
registerCardListener(computeReplaceListener)

export const B103_FieldMerchant = new Occupation({
  id: CARD_ID,
  name: "Field Merchant",
  deck: "B",
  number: 103,
  category: "GOODS_PROVIDER",
  desc: ["When you play this card, you immediately get 1 <WOOD> and 1 <REED>. Each time you decline a __Minor/Major Improvement__ action, you get 1 <FOOD>/<VEGETABLE> instead."],
  cost: {},
  players: "1+",
  reward: { wood: 1, reed: 1 },
})
