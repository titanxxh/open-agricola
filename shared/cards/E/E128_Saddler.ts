import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { payThenActionFlow } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import { E128_Saddler } from '../../cards-display/E/E128_Saddler'

const CARD_ID = E128_Saddler.id

const listener: CardListenerRegistration = {
  id: 'E128-saddler-after-pay',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['pay'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const ctx = context as unknown as { costType?: string }
    if (ctx.costType !== 'major-improvement') return
    return {
      ...payThenActionFlow({
        cardId: CARD_ID,
        cost: { food: 1 },
        promptKey: 'ui.interactionSaddlerPlow',
        action: { type: 'leaf', actionId: 'plow' },
      }),
      sourceCard: CARD_ID,
    }
  },
}

export const E128_Saddler_impl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl
