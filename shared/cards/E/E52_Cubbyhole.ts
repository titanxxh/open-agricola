import { MinorImprovement } from '../types'
import { registerCardEffect } from '../card-effects'
import { registerCardListener } from '../card-listeners'
import type { CardListenerContext, CardListenerRegistration } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { getRoomsBuiltThisAction } from '../helpers/action-snapshot'
import { getStoredResource } from '../helpers/card-storage'

const CARD_ID = 'E52_Cubbyhole'

const constructListener: CardListenerRegistration = {
  id: 'E52-cubbyhole-after-construct',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['construct'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const roomCount = getRoomsBuiltThisAction(context.player)
    if (roomCount <= 0) return
    return {
      flow: {
        type: 'leaf',
        actionId: 'store-on-card',
        params: { food: roomCount },
        sourceCard: CARD_ID,
      },
      logKey: 'log.cardEffectTrigger',
      logParams: { cardId: CARD_ID },
      sourceCard: CARD_ID,
    }
  },
}

registerCardListener(constructListener)

registerCardEffect({
  id: CARD_ID,
  onStartHarvestFeedingPhase: (_state, player) => {
    const storedFood = getStoredResource(player, CARD_ID, 'food')
    if (storedFood <= 0) return
    return {
      type: 'leaf',
      actionId: 'take-from-card',
      params: { food: storedFood },
      sourceCard: CARD_ID,
    }
  },
})

export const E52_Cubbyhole = new MinorImprovement({
  id: CARD_ID,
  name: "Cubbyhole",
  deck: "E",
  number: 52,
  category: "FOOD",
  desc: ["For each room that you add to your house, place 1 <FOOD> from the general supply on this card. At the start of each feeding phase, you get <FOOD> equal to the amount on this card."],
  cost: {},
  vp: 1,
})
