import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import { E50_WildGreens } from '../../cards-display/E/E50_WildGreens'
export { E50_WildGreens }

const CARD_ID = E50_WildGreens.id

const listener: CardListenerRegistration = {
  id: 'E50-wild-greens-after-sow',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['sow'],
  handler: (_context: CardListenerContext): ActionHookResult | void => {
    // Each sow action plants one distinct type → 1 food
    return { flow: gainLeaf(CARD_ID, { food: 1 }), sourceCard: CARD_ID }
  },
}

export const E50_WildGreens_impl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl
