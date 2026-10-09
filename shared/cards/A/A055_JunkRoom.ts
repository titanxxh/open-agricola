import { defineMinorCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'A055_JunkRoom'
const listener: CardListenerRegistration = {
  id: 'A55-junk-room-after-improvement',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['improvement'],
  handler: (_context: CardListenerContext): ActionHookResult | void => {
    return { flow: gainLeaf(CARD_ID, { food: 1 }), sourceCard: CARD_ID }
  },
}

const cardImpl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const A055_JunkRoom = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Junk Room",
    deck: "A",
    number: 55,
    category: "FOOD_PROVIDER",
    desc: ["Each time after you build an improvement, including this one, you get 1 <FOOD>."],
    cost: {"wood":1,"clay":1},
  },
  impl: cardImpl,
})

export const A055_JunkRoom_impl = A055_JunkRoom.impl
