import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import { A105_BarrowPusher } from '../../cards-display/A/A105_BarrowPusher'
export { A105_BarrowPusher }

const CARD_ID = A105_BarrowPusher.id

const listener: CardListenerRegistration = {
  id: 'A105-barrow-pusher-after-plow',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['plow'],
  handler: (_context: CardListenerContext): ActionHookResult | void => {
    return { flow: gainLeaf(CARD_ID, { clay: 1, food: 1 }), sourceCard: CARD_ID }
  },
}

export const A105_BarrowPusher_impl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl
