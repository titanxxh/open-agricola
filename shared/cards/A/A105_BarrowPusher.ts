import { defineOccupationCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'A105_BarrowPusher'
const listener: CardListenerRegistration = {
  id: 'A105-barrow-pusher-after-plow',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['plow'],
  handler: (_context: CardListenerContext): ActionHookResult | void => {
    return { flow: gainLeaf(CARD_ID, { clay: 1, food: 1 }), sourceCard: CARD_ID }
  },
}

const cardImpl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const A105_BarrowPusher = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: "Barrow Pusher",
    deck: "A",
    number: 105,
    category: "GOODS_PROVIDER",
    desc: ["For each new <FIELD> tile you get, you also get 1 <CLAY> and 1 <FOOD>."],
    cost: {},
    players: "1+",
  },
  impl: cardImpl,
})

export const A105_BarrowPusher_impl = A105_BarrowPusher.impl
