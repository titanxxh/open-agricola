import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { CardImpl } from '../registry'
import { A95_Angler } from '../../cards-display/A/A95_Angler'
export { A95_Angler }

const CARD_ID = A95_Angler.id

const listener: CardListenerRegistration = {
  id: 'A95-angler-after-collect',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['collect'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.space?.id !== 'fishing') return
    // The food was on the space before collecting - check the resources that were gained
    // BGA check: count($event['meeples']) <= 2 means ≤2 food was on the space
    const foodGained = (context.result?.type === 'ok'
      ? (context.result.resourcesGained?.food ?? 0)
      : 0)
    if (foodGained > 2) return
    return {
      flow: {
        type: 'leaf',
        actionId: 'improvement-any',
        optional: true,
        sourceCard: CARD_ID,
      },
      sourceCard: CARD_ID,
    }
  },
}

export const A95_Angler_impl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl
