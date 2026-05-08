import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import { E57_CheeseFondue } from '../../cards-display/E/E57_CheeseFondue'

const CARD_ID = E57_CheeseFondue.id

const listener: CardListenerRegistration = {
  id: 'E57-cheese-fondue-after-exchange',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['bake-bread'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    let bonus = 0
    if (context.player.resources.sheep > 0) bonus += 1
    if (context.player.resources.cattle > 0) bonus += 1
    if (bonus <= 0) return
    return { flow: gainLeaf(CARD_ID, { food: bonus }), sourceCard: CARD_ID }
  },
}

export const E57_CheeseFondue_impl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl
