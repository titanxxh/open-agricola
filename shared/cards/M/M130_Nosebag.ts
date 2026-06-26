import { defineMinorCard } from '../card-source'
import type { CardListenerContext, CardListenerRegistration } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'M130_Nosebag'

const listener: CardListenerRegistration = {
  id: 'M130-nosebag-after-place-farmer',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['place-farmer'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.space?.id !== 'grain-seeds') return
    return { flow: gainLeaf(CARD_ID, { horse: 1 }), sourceCard: CARD_ID }
  },
}

const cardImpl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const M130_Nosebag = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Nosebag",
    deck: "M",
    number: 130,
    category: "LIVESTOCK_PROVIDER",
    desc: [
        "Each time you use the \"Grain Seeds\" action space, you also get 1 horse."
    ],
    cost: {
        "vegetable": 1
    },
    prerequisite: "1 Major Improvement",
    implemented: true,
    requiresFarmersOfTheMoor: true,
  },
  impl: cardImpl,
})

export const M130_Nosebag_impl = M130_Nosebag.impl
