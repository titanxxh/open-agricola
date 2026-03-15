import { MinorImprovement } from '../types'
import { registerCardListener } from '../card-listeners'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'

const CARD_ID = 'E130_Overachiever'

const DISCOUNT_RESOURCES = [
  'wood', 'clay', 'stone', 'reed', 'food', 'grain', 'vegetable',
  'sheep', 'boar', 'cattle',
] as const

const afterWishChildrenListener: CardListenerRegistration = {
  id: 'E130-overachiever-after-wish-children',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['wish-children-growth'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!context.player.minorPlayed.includes(CARD_ID)) return
    return {
      flow: { type: 'leaf', actionId: 'improvement-any', optional: true, promptKey: 'ui.interactionOverachieverImprovement', sourceCard: CARD_ID },
      logKey: 'log.cardGrantedAction',
      logParams: { cardId: CARD_ID, actionId: 'improvement-any' },
      sourceCard: CARD_ID,
    }
  },
}

const computeCardCostsListener: CardListenerRegistration = {
  id: 'E130-overachiever-compute-card-costs',
  cardIds: [CARD_ID],
  phases: ['computeCardCosts' as ActionHookPhase],
  actions: ['improvement-any'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!context.player.minorPlayed.includes(CARD_ID)) return
    if (context.actionCardId !== CARD_ID) return
    return {
      bonuses: DISCOUNT_RESOURCES.map((res) => ({
        discount: { [res]: 1 },
        optional: true,
        sources: [CARD_ID],
      })),
    }
  },
}

registerCardListener(afterWishChildrenListener)
registerCardListener(computeCardCostsListener)

export const E130_Overachiever = new MinorImprovement({
  id: CARD_ID,
  name: "Overachiever",
  deck: "E",
  number: 130,
  category: "ACTIONS_BOOSTER",
  desc: ["Each time you use a Wish for Children action space, you can also take a Major or Minor Improvement action (with a 1 resource discount of your choice)."],
  cost: {},
  players: "3+",
})
