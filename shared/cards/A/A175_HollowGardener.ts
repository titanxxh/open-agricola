import { defineOccupationCard } from '../card-source'
import type { CardListenerContext, CardListenerRegistration } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { isHollowSpaceId } from '../helpers/action-space-categories'
import { sumActionSpaceMovedToTriggerPlayerFromSpace } from '../helpers/event-provenance'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'A175_HollowGardener'
const listener: CardListenerRegistration = {
  id: 'A175-hollow-gardener-after-hollow-collect',
  cardIds: [CARD_ID],
  actions: ['collect'],
  phases: ['after' as ActionHookPhase],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!isHollowSpaceId(context.space?.id)) return
    const clay = sumActionSpaceMovedToTriggerPlayerFromSpace(context, 'clay')
    if (clay < 3) return
    return { flow: gainLeaf(CARD_ID, clay >= 6 ? { vegetable: 1 } : { grain: 1 }), sourceCard: CARD_ID }
  },
}

const cardImpl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const A175_HollowGardener = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Hollow Gardener',
    deck: 'A',
    number: 175,
    category: 'CROP_PROVIDER',
    desc: ['Each time you take at least 3 clay from the "Hollow" accumulation space, you also get 1 grain. If you take at least 6 clay from it, you also get 1 vegetable (instead of grain).'],
    cost: {},
    players: '5+',
  },
  impl: cardImpl,
})

export const A175_HollowGardener_impl = A175_HollowGardener.impl
