import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import { D104_Cultivator } from '../../cards-display/D/D104_Cultivator'

const CARD_ID = D104_Cultivator.id

const listener: CardListenerRegistration = {
  id: 'D104-cultivator-after-plow',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['plow'],
  handler: (_context: CardListenerContext): ActionHookResult | void => {
    return { flow: gainLeaf(CARD_ID, { wood: 1, food: 1 }), sourceCard: CARD_ID }
  },
}

export const D104_Cultivator_impl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl
