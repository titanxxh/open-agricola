import { Occupation } from '../types'
import { registerCardListener } from '../card-listeners'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { incCounter } from '../__stubs__/helpers'

const CARD_ID = 'B103_FieldMerchant'

const computeReplaceListener: CardListenerRegistration = {
  id: 'B103-field-merchant-replace-improvement',
  cardIds: [CARD_ID],
  phases: ['computeReplace' as ActionHookPhase],
  actions: ['improvement-any'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!context.player.occupationPlayed.includes(CARD_ID)) return
    incCounter(context.player, CARD_ID, 'triggerCount')
    return {
      decline: true,
      alternativeFlow: {
        type: 'xor',
        promptKey: 'ui.interactionFieldMerchantChoose',
        children: [
          { type: 'leaf', actionId: 'gain', params: { food: 1 } },
          { type: 'leaf', actionId: 'gain', params: { vegetable: 1 } },
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
    incCounter(context.player, CARD_ID, 'triggerCount')
    return {
      flow: { type: 'leaf', actionId: 'gain', params: { wood: 1, reed: 1 }, sourceCard: CARD_ID },
      logKey: 'log.cardEffectGain',
      logParams: { gain: { wood: 1, reed: 1 }, cardId: CARD_ID },
      sourceCard: CARD_ID,
    }
  },
}

registerCardListener(computeReplaceListener)
registerCardListener(onPlayListener)

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
