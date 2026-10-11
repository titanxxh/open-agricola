import { defineOccupationCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { payThenActionFlow } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import { isMajorCardId } from '../helpers/card-type'
import { getPlowableTiles } from '../../actions/effects/plow'

const CARD_ID = 'E128_Saddler'
const listener: CardListenerRegistration = {
  id: 'E128-saddler-after-improvement',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['improvement'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const cardId = context.choice?.replace(/^(?:major|minor):/, '')
    if (!cardId || !isMajorCardId(cardId)) return
    if (getPlowableTiles(context.player).length === 0) return
    return {
      ...payThenActionFlow({
        cardId: CARD_ID,
        cost: { food: 1 },
        promptKey: 'ui.interactionSaddlerPlow',
        action: { type: 'leaf', actionId: 'plow' },
      }),
      sourceCard: CARD_ID,
    }
  },
}

const cardImpl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const E128_Saddler = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: "Saddler",
    deck: "E",
    number: 128,
    category: "FARMYARD",
    desc: ["Each time after you build a major improvement, you can pay 1 <FOOD> to plow 1 <FIELD>."],
    cost: {},
    players: "3+",
  },
  impl: cardImpl,
})

export const E128_Saddler_impl = E128_Saddler.impl
