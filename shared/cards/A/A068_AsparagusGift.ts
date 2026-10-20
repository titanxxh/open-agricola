import { defineMinorCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import { getLogicalFields } from '../helpers/card-field'
import { countNewFenceEdges } from '../helpers/fence-events'

const CARD_ID = 'A068_AsparagusGift'

const afterListener: CardListenerRegistration = {
  id: 'A68-asparagus-gift-after-fencing',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['fence'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (countNewFenceEdges(context) < context.state.round) return
    return { flow: gainLeaf(CARD_ID, { vegetable: 1 }), sourceCard: CARD_ID }
  },
}

const cardImpl = {
  listeners: [afterListener],
  prerequisiteCheck: (player) => getLogicalFields(player).some((field) => field.stacks.length === 0),
  reaches: [] as readonly string[],
} satisfies CardImpl

export const A068_AsparagusGift = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: 'Asparagus Gift',
    deck: 'A',
    number: 68,
    category: 'CROP_PROVIDER',
    desc: ['Each time you build a number of <FENCE> equal to or greater than the current round, you immediately get 1 <VEGETABLE>.'],
    cost: {},
    prerequisite: '1 Unplanted Field',
  },
  impl: cardImpl,
})

export const A068_AsparagusGift_impl = A068_AsparagusGift.impl
