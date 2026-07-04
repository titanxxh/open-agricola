import { defineMinorCard } from '../card-source'
import type { CardListenerContext, CardListenerRegistration } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'M089_BirthingHouse'

const listener: CardListenerRegistration = {
  id: 'M089-birthing-house-after-family-growth',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['family-growth'],
  handler: (_context: CardListenerContext): ActionHookResult => ({
    flow: {
      type: 'seq',
      children: [
        gainLeaf(CARD_ID, { fuel: 1, food: 1 }),
        { type: 'leaf', actionId: 'bonus-vp', sourceCard: CARD_ID },
      ],
    },
    sourceCard: CARD_ID,
  }),
}

const cardImpl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const M089_BirthingHouse = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Birthing House",
    deck: "M",
    number: 89,
    category: "GOODS_PROVIDER",
    desc: [
        "Immediately after each time you take a \"Family Growth\" action with or without room, you get 1 <FUEL>, 1 <FOOD>, and 1 bonus <SCORE>."
    ],
    cost: {
        "clay": 2,
        "stone": 1
    },
    vp: 2,
    extraVp: true,
    implemented: true,
    requiresFarmersOfTheMoor: true,
  },
  impl: cardImpl,
})

export const M089_BirthingHouse_impl = M089_BirthingHouse.impl
