import { MinorImprovement } from '../types'
import { registerCardListener } from '../card-listeners'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { incCounter } from '../__stubs__/helpers'

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
    incCounter(context.player, CARD_ID, 'triggerCount')
    return {
      flow: { type: 'leaf', actionId: 'improvement-any', optional: true, promptKey: 'ui.interactionOverachieverImprovement' },
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
    const counters = context.player.cardStates?.[CARD_ID]?.counters
    if (!counters?.triggerCount || counters.triggerCount <= 0) return
    // Player chooses which resource to discount by 1 (any of the standard resources)
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
