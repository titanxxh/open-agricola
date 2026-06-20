import { defineOccupationCard } from '../card-source'
import type { CardListenerContext, CardListenerRegistration } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'B174_RiverbankGardener'
const listener: CardListenerRegistration = {
  id: 'B174-riverbank-gardener-after-riverbank-forest',
  cardIds: [CARD_ID],
  actions: ['collect'],
  phases: ['after' as ActionHookPhase],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.space?.id !== 'riverbank-forest-56') return
    return { flow: gainLeaf(CARD_ID, { vegetable: 1 }), sourceCard: CARD_ID }
  },
}

const cardImpl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const B174_RiverbankGardener = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Riverbank Gardener',
    deck: 'B',
    number: 174,
    category: 'CROP_PROVIDER',
    desc: ['Each time you use the "Riverbank Forest" accumulation space, you also get 1 vegetable.'],
    cost: {},
    players: '5+',
  },
  impl: cardImpl,
})

export const B174_RiverbankGardener_impl = B174_RiverbankGardener.impl
