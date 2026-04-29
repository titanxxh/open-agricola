import { Occupation } from '../types'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'E113_Godmother'

// E113 Godmother: Each time you take a Family Growth action, you also get 1 VEGETABLE.
const listener: CardListenerRegistration = {
  id: 'E113-godmother-after-wish-children',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['wish-children', 'wish-children-growth'],
  handler: (_context: CardListenerContext): ActionHookResult | void => {
    return { flow: gainLeaf(CARD_ID, { vegetable: 1 }), sourceCard: CARD_ID }
  },
}

export const E113_Godmother = new Occupation({
  id: CARD_ID,
  name: 'Godmother',
  deck: 'E',
  number: 113,
  category: 'CROPS_-_VEGETABLE',
  desc: ['Each time you take a __Family Growth__ action, you also get 1 <VEGETABLE>.'],
  cost: {},
  players: '1+',
})

export const E113_Godmother_impl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl
