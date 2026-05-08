import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { CardImpl } from '../registry'
import { C90_FieldWatchman } from '../../cards-display/C/C90_FieldWatchman'
export { C90_FieldWatchman }

const CARD_ID = C90_FieldWatchman.id

const listener: CardListenerRegistration = {
  id: 'C90-field-watchman-after-place-farmer',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['place-farmer'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.space?.id !== 'grain-seeds') return
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

export const C90_FieldWatchman_impl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl
