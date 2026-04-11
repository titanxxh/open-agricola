import { Occupation } from '../types'
import { registerCardListener } from '../card-listeners'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'

const CARD_ID = 'B103_FieldMerchant'

const computeReplaceListener: CardListenerRegistration = {
  id: 'B103-field-merchant-replace-improvement',
  cardIds: [CARD_ID],
  phases: ['computeReplace' as ActionHookPhase],
  actions: ['improvement-any'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!context.player.occupationPlayed.includes(CARD_ID)) return
    if (context.trueAction === false) return
    if (context.actionContext?.checkedReplaceAction) return
    return {
      decline: true,
      alternativeFlow: {
        type: 'seq',
        choiceLabelKey: 'ui.interactionFieldMerchantChoose',
        children: [
          {
            type: 'xor',
            promptKey: 'ui.interactionFieldMerchantChoose',
            children: [
              { type: 'leaf', actionId: 'gain', params: { food: 1 }, sourceCard: CARD_ID },
              { type: 'leaf', actionId: 'gain', params: { vegetable: 1 }, sourceCard: CARD_ID },
            ],
          },
        ],
      },
    }
  },
}

const onPlayListener: CardListenerRegistration = {
  id: 'B103-field-merchant-after-play',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['play-occupation'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.choice !== CARD_ID) return
    if (!context.player.occupationPlayed.includes(CARD_ID)) return
    return { flow: gainLeaf(CARD_ID, { wood: 1, reed: 1 }), sourceCard: CARD_ID }
  },
}

const isDoableListener: CardListenerRegistration = {
  id: 'B103-field-merchant-isdoable-improvement',
  cardIds: [CARD_ID],
  phases: ['isDoable' as ActionHookPhase],
  actions: ['improvement-any'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!context.player.occupationPlayed.includes(CARD_ID)) return
    if (context.doable) return
    return { doable: true }
  },
}

registerCardListener(computeReplaceListener)
registerCardListener(onPlayListener)
registerCardListener(isDoableListener)

export const B103_FieldMerchant = new Occupation({
  id: CARD_ID,
  name: "Field Merchant",
  deck: "B",
  number: 103,
  category: "GOODS_PROVIDER",
  desc: ["When you play this card, you immediately get 1 <WOOD> and 1 <REED>. Each time you decline a __Minor/Major Improvement__ action, you get 1 <FOOD>/<VEGETABLE> instead."],
  cost: {},
  players: "1+",
})
