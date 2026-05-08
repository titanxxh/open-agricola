import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import { E113_Godmother } from '../../cards-display/E/E113_Godmother'
export { E113_Godmother }

const CARD_ID = E113_Godmother.id

const listener: CardListenerRegistration = {
  id: 'E113-godmother-after-wish-children',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['wish-children', 'family-growth'],
  handler: (_context: CardListenerContext): ActionHookResult | void => {
    return { flow: gainLeaf(CARD_ID, { vegetable: 1 }), sourceCard: CARD_ID }
  },
}

export const E113_Godmother_impl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl
