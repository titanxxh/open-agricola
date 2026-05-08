import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { ActionFlow } from '../../contract/types'
import type { CardImpl } from '../registry'
import { B87_Cottager } from '../../cards-display/B/B87_Cottager'

const CARD_ID = B87_Cottager.id

const listener: CardListenerRegistration = {
  id: 'B87-cottager-after-place-farmer',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['place-farmer'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.space?.id !== 'day-laborer') return
    const children: ActionFlow[] = [
      { type: 'leaf', actionId: 'construct', optional: false, sourceCard: CARD_ID, actionContext: { max: 1, trueAction: false } },
      { type: 'leaf', actionId: 'renovate-house', sourceCard: CARD_ID, actionContext: { trueAction: false } },
    ]
    return {
      flow: {
        type: 'xor',
        optional: true,
        children,
      },
      sourceCard: CARD_ID,
    }
  },
}

export const B87_Cottager_impl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl
