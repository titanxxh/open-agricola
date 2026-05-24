import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { CardImpl } from '../registry'
import { E89_Stallwright } from '../../cards-display/E/E89_Stallwright'

const CARD_ID = E89_Stallwright.id

const TRIGGER_COUNTS = new Set([2, 3, 5, 7])

const listener: CardListenerRegistration = {
  id: 'E89-stallwright-after-occupation',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['occupation'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const n = context.player.occupationPlayed.length
    if (!TRIGGER_COUNTS.has(n)) return
    return {
      flow: {
        type: 'leaf',
        actionId: 'stables',
        optional: true,
        sourceCard: CARD_ID,
        actionContext: { max: 1, costs: {}, trueAction: false },
      },
      sourceCard: CARD_ID,
    }
  },
}

export const E89_Stallwright_impl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl
