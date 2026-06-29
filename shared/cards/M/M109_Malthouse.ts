import { defineMinorCard } from '../card-source'
import type { CardListenerContext, CardListenerRegistration } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf, payLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'M109_Malthouse'

const listener: CardListenerRegistration = {
  id: 'M109-malthouse-after-cut-peat',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['cut-peat'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if ((context.player.resources.grain ?? 0) < 1) return
    return {
      flow: {
        type: 'seq',
        optional: true,
        children: [
          payLeaf({ cardId: CARD_ID, cost: { grain: 1 } }),
          gainLeaf(CARD_ID, { food: 4 }),
        ],
      },
      sourceCard: CARD_ID,
    }
  },
}

const cardImpl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const M109_Malthouse = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Malthouse",
    deck: "M",
    number: 109,
    category: "FOOD_PROVIDER",
    desc: [
        "Each time you take the \"Cut Peat\" special action, you can also turn exactly 1 grain into 4 food."
    ],
    cost: {
        "clay": 2
    },
    vp: 1,
    implemented: true,
    requiresFarmersOfTheMoor: true,
  },
  impl: cardImpl,
})

export const M109_Malthouse_impl = M109_Malthouse.impl
