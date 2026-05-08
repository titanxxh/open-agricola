import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import { A63_DutchWindmill } from '../../cards-display/A/A63_DutchWindmill'
export { A63_DutchWindmill }

const CARD_ID = A63_DutchWindmill.id

const POST_HARVEST_ROUNDS = new Set([5, 8, 10, 12, 14])

const listener: CardListenerRegistration = {
  id: 'A63-dutch-windmill-after-bake',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['bake-bread'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!POST_HARVEST_ROUNDS.has(context.state.round)) return
    return { flow: gainLeaf(CARD_ID, { food: 3 }), sourceCard: CARD_ID }
  },
}

export const A63_DutchWindmill_impl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl
