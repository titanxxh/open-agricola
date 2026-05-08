import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { payLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import { E19_OxGoad } from '../../cards-display/E/E19_OxGoad'
export { E19_OxGoad }

const CARD_ID = E19_OxGoad.id

const listener: CardListenerRegistration = {
  id: 'E19-ox-goad-after-place-farmer',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['place-farmer'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.space?.id !== 'cattle-market') return
    return {
      flow: {
        type: 'seq',
        optional: true,
        children: [
          payLeaf({ cardId: CARD_ID, cost: { food: 2 } }),
          { type: 'leaf', actionId: 'plow' },
        ],
      },
      sourceCard: CARD_ID,
    }
  },
}

export const E19_OxGoad_impl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl
