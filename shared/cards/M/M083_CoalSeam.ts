import { defineMinorCard } from '../card-source'
import type { CardListenerContext, CardListenerRegistration } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'M083_CoalSeam'

const listener: CardListenerRegistration = {
  id: 'M083-coal-seam-after-work',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['hiring-fair', 'place-farmer'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.actionId !== 'hiring-fair' && context.space?.id !== 'day-laborer') return
    return { flow: gainLeaf(CARD_ID, { fuel: 1 }), sourceCard: CARD_ID }
  },
}

const cardImpl = {
  effect: {
    id: CARD_ID,
    onBuy: () => gainLeaf(CARD_ID, { fuel: 1 }),
  },
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const M083_CoalSeam = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Coal Seam",
    deck: "M",
    number: 83,
    category: "ACTIONS_BOOSTER",
    desc: [
        "When you play this card, you immediately get 1 <FUEL>. Each time you take the __Hiring Fair__ special action or use the __Day Laborer__ action space, you also get 1 <FUEL>."
    ],
    cost: {
        "wood": 1,
        "clay": 1
    },
    vp: 1,
    implemented: true,
    requiresFarmersOfTheMoor: true,
  },
  impl: cardImpl,
})

export const M083_CoalSeam_impl = M083_CoalSeam.impl
