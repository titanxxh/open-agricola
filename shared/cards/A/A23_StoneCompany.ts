import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { CardImpl } from '../registry'
import { A23_StoneCompany } from '../../cards-display/A/A23_StoneCompany'
export { A23_StoneCompany }

const CARD_ID = A23_StoneCompany.id

const QUARRY_SPACES = new Set(['eastern-quarry', 'western-quarry'])

const listener: CardListenerRegistration = {
  id: 'A23-stone-company-after-collect',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['collect'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!context.space || !QUARRY_SPACES.has(context.space.id)) return
    return {
      flow: {
        type: 'seq',
        optional: true,
        children: [
          {
            type: 'leaf',
            actionId: 'improvement-any',
            sourceCard: CARD_ID,
            actionContext: { purchaseCondition: CARD_ID },
          },
        ],
      },
      sourceCard: CARD_ID,
    }
  },
}

export const A23_StoneCompany_impl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl
