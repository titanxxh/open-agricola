import { Occupation } from '../types'
import { registerCardListener } from '../card-listeners'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'

const CARD_ID = 'A139_HollowWarden'

/**
 * A139 Hollow Warden:
 * When you play this card, you immediately get a Major Improvement action to build a Fireplace.
 * Each time you use the Hollow accumulation space, you also get 1 Food.
 *
 * BGA: onBuy → optional improvement action for fireplaces (Major_Fireplace1, Major_Fireplace2,
 *      A60_OrientalFireplace). isListeningTo → isActionCardEvent(Hollow).
 *      onPlayerPlaceFarmer → gain 1 food.
 *
 * Occupation onBuy flows must use a play-occupation listener (engine does not
 * process onBuy flows for occupations — only for improvements).
 */
const FIREPLACE_IDS = ['Major_Fireplace1', 'Major_Fireplace2', 'A60_OrientalFireplace']

const onBuyListener: CardListenerRegistration = {
  id: 'A139-hollow-warden-onbuy',
  cardIds: [CARD_ID],
  actions: ['play-occupation'],
  phases: ['after' as ActionHookPhase],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.choice !== CARD_ID) return
    return {
      flow: {
        type: 'leaf',
        actionId: 'improvement-any',
        optional: true,
        sourceCard: CARD_ID,
        actionContext: { trueAction: false },
        params: {
          allowedPurchases: FIREPLACE_IDS,
        } as any,
      },
      sourceCard: CARD_ID,
    }
  },
}

const hollowListener: CardListenerRegistration = {
  id: 'A139-hollow-warden-after-hollow',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['place-farmer'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.space?.id !== 'hollow-4') return
    return { flow: gainLeaf(CARD_ID, { food: 1 }), sourceCard: CARD_ID }
  },
}

registerCardListener(onBuyListener)
registerCardListener(hollowListener)

export const A139_HollowWarden = new Occupation({
  id: CARD_ID,
  name: 'Hollow Warden',
  deck: 'A',
  number: 139,
  category: 'FOOD_PROVIDER',
  desc: [
    'When you play this card, you immediately get a __Major Improvement__ action to build a Fireplace. Each time you use the __Hollow__ accumulation space, you also get 1 <FOOD>.',
  ],
  cost: {},
  players: '3+',
  newSet: true,
})
