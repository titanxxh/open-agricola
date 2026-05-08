import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import { E79_FieldSpade } from '../../cards-display/E/E79_FieldSpade'
export { E79_FieldSpade }

const CARD_ID = E79_FieldSpade.id

const listener: CardListenerRegistration = {
  id: 'E79-field-spade-after-sow',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['sow'],
  handler: (_context: CardListenerContext): ActionHookResult | void => {
    return { flow: gainLeaf(CARD_ID, { stone: 1 }), sourceCard: CARD_ID }
  },
}

export const E79_FieldSpade_impl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl
