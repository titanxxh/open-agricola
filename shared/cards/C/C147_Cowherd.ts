import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import { C147_Cowherd } from '../../cards-display/C/C147_Cowherd'

const CARD_ID = C147_Cowherd.id

const listener: CardListenerRegistration = {
  id: 'C147-cowherd-after-place-farmer',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['place-farmer'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.space?.id !== 'cattle-market') return
    return { flow: gainLeaf(CARD_ID, { cattle: 1 }), sourceCard: CARD_ID }
  },
}

export const C147_Cowherd_impl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl
