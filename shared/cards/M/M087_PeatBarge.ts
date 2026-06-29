import { defineMinorCard } from '../card-source'
import type { CardListenerContext, CardListenerRegistration } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'M087_PeatBarge'

const listener: CardListenerRegistration = {
  id: 'M087-peat-barge-after-place-farmer',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['place-farmer'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.space?.id !== 'fishing') return
    return { flow: gainLeaf(CARD_ID, { fuel: 2 }), sourceCard: CARD_ID }
  },
}

const cardImpl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const M087_PeatBarge = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Peat Barge",
    deck: "M",
    number: 87,
    category: "GOODS_PROVIDER",
    desc: [
        "Each time you use the \"Fishing\" accumulation space, you also get 2 fuel."
    ],
    cost: {
        "wood": 2
    },
    vp: 1,
    implemented: true,
    requiresFarmersOfTheMoor: true,
  },
  impl: cardImpl,
})

export const M087_PeatBarge_impl = M087_PeatBarge.impl
