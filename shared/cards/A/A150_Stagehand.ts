import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { CardImpl } from '../registry'
import { A150_Stagehand } from '../../cards-display/A/A150_Stagehand'

const CARD_ID = A150_Stagehand.id

const listener: CardListenerRegistration = {
  id: 'A150-stagehand-opponent-traveling-players',
  cardIds: [CARD_ID],
  actions: ['place-farmer'],
  phases: ['after' as ActionHookPhase],
  scope: 'opponent',
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.space?.id !== 'traveling-players') return
    return {
      flow: {
        type: 'xor',
        optional: true,
        children: [
          { type: 'leaf', actionId: 'fence', sourceCard: CARD_ID, actionContext: { trueAction: false } },
          { type: 'leaf', actionId: 'stables', sourceCard: CARD_ID, actionContext: { trueAction: false } },
          { type: 'leaf', actionId: 'construct', sourceCard: CARD_ID, actionContext: { trueAction: false } },
        ],
      },
      sourceCard: CARD_ID,
    }
  },
}

export const A150_Stagehand_impl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl
