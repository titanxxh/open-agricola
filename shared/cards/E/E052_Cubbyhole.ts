import { defineMinorCard } from '../card-source'
import type { CardListenerContext, CardListenerRegistration } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { getRoomsBuiltThisAction } from '../helpers/action-snapshot'
import { getStoredResource } from '../helpers/card-storage'
import type { CardImpl } from '../registry'

const CARD_ID = 'E052_Cubbyhole'
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
      sourceCard: CARD_ID,
    }
  },
}

const cardImpl = {
  listeners: [constructListener],
  effect: {
  id: CARD_ID,
  onStartHarvestFeedingPhase: (_state, player) => {
    const storedFood = getStoredResource(player, CARD_ID, 'food')
    if (storedFood <= 0) return
    return {
      type: 'leaf',
      actionId: 'gain',
      params: { food: storedFood },
      sourceCard: CARD_ID,
    }
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl

export const E052_Cubbyhole = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Cubbyhole",
    deck: "E",
    number: 52,
    category: "FOOD",
    desc: ["For each room that you add to your house, place 1 <FOOD> from the general supply on this card. At the start of each feeding phase, you get <FOOD> equal to the amount on this card."],
    altCosts: [{ wood: 1 }, { clay: 1 }],
    vp: 1,
  },
  presentation: { counters: ['food'] },
  impl: cardImpl,
})

export const E052_Cubbyhole_impl = E052_Cubbyhole.impl
