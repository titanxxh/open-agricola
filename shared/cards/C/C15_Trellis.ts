import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { CardImpl } from '../registry'
import { C15_Trellis } from '../../cards-display/C/C15_Trellis'

const CARD_ID = C15_Trellis.id

const listener: CardListenerRegistration = {
  id: 'C15-trellis-before-place-farmer',
  cardIds: [CARD_ID],
  phases: ['before' as ActionHookPhase],
  actions: ['place-farmer'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.space?.id !== 'pig-market') return
    return {
      flow: {
        type: 'seq',
        optional: true,
        children: [
          {
            type: 'leaf',
            actionId: 'fence',
            sourceCard: CARD_ID,
          },
        ],
      },
      sourceCard: CARD_ID,
    }
  },
}

export const C15_Trellis_impl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl
