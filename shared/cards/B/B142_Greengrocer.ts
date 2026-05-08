import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import { B142_Greengrocer } from '../../cards-display/B/B142_Greengrocer'

const CARD_ID = B142_Greengrocer.id

const listener: CardListenerRegistration = {
  id: 'B142-greengrocer-after-place-farmer',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['place-farmer'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.space?.id !== 'grain-seeds') return
    return { flow: gainLeaf(CARD_ID, { vegetable: 1 }), sourceCard: CARD_ID }
  },
}

export const B142_Greengrocer_impl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl
