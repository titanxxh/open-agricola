import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { CardImpl } from '../registry'
import { B91_AssistantTiller } from '../../cards-display/B/B91_AssistantTiller'
export { B91_AssistantTiller }

const CARD_ID = B91_AssistantTiller.id

const listener: CardListenerRegistration = {
  id: 'B91-assistant-tiller-after-place-farmer',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['place-farmer'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.space?.id !== 'day-laborer') return
    return {
      flow: {
        type: 'leaf',
        actionId: 'plow',
        optional: true,
        sourceCard: CARD_ID,
      },
      sourceCard: CARD_ID,
    }
  },
}

export const B91_AssistantTiller_impl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl
