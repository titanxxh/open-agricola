import { defineOccupationCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'E113_Godmother'
const listener: CardListenerRegistration = {
  id: 'E113-godmother-after-wish-children',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['wish-children', 'family-growth'],
  handler: (_context: CardListenerContext): ActionHookResult | void => {
    return { flow: gainLeaf(CARD_ID, { vegetable: 1 }), sourceCard: CARD_ID }
  },
}

const cardImpl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const E113_Godmother = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Godmother',
    deck: 'E',
    number: 113,
    category: 'CROPS_-_VEGETABLE',
    desc: ['Each time you take a __Family Growth__ action, you also get 1 <VEGETABLE>.'],
    cost: {},
    players: '1+',
  },
  impl: cardImpl,
})

export const E113_Godmother_impl = E113_Godmother.impl
