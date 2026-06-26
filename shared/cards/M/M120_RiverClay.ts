import { defineMinorCard } from '../card-source'
import type { CardListenerContext, CardListenerRegistration } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'M120_RiverClay'

const listener: CardListenerRegistration = {
  id: 'M120-river-clay-after-place-farmer',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['place-farmer'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.space?.id !== 'fishing') return
    return { flow: gainLeaf(CARD_ID, { clay: 2 }), sourceCard: CARD_ID }
  },
}

const cardImpl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const M120_RiverClay = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "River Clay",
    deck: "M",
    number: 120,
    category: "BUILDING_RESOURCE_PROVIDER",
    desc: [
        "Each time you use the \"Fishing\" accumulation space, you also get 2 clay."
    ],
    cost: {},
    prerequisite: "1 Major Improvement",
    implemented: true,
    requiresFarmersOfTheMoor: true,
  },
  impl: cardImpl,
})

export const M120_RiverClay_impl = M120_RiverClay.impl
