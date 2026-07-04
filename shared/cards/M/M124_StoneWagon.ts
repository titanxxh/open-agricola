import { defineMinorCard } from '../card-source'
import type { CardListenerContext, CardListenerRegistration } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'M124_StoneWagon'

const listener: CardListenerRegistration = {
  id: 'M124-stone-wagon-after-place-farmer',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['place-farmer'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.space?.id !== 'day-laborer') return
    return { flow: gainLeaf(CARD_ID, { stone: 1 }), sourceCard: CARD_ID }
  },
}

const cardImpl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const M124_StoneWagon = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Stone Wagon",
    deck: "M",
    number: 124,
    category: "BUILDING_RESOURCE_PROVIDER",
    desc: [
        "Each time you use the __Day Laborer__ action space, you also get 1 <STONE>."
    ],
    cost: {
        "wood": 2
    },
    implemented: true,
    requiresFarmersOfTheMoor: true,
  },
  impl: cardImpl,
})

export const M124_StoneWagon_impl = M124_StoneWagon.impl
