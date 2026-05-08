import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import { E122_Cottar } from '../../cards-display/E/E122_Cottar'
export { E122_Cottar }

const CARD_ID = E122_Cottar.id

const listener: CardListenerRegistration = {
  id: 'E122-cottar-after-pay',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['pay'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const ctx = context as unknown as { costType?: string }
    const costType = ctx.costType
    if (costType !== 'major-improvement' && costType !== 'minor-improvement') return
    return {
      flow: {
        type: 'xor',
        children: [
          gainLeaf(CARD_ID, { wood: 1 }),
          gainLeaf(CARD_ID, { clay: 1 }),
        ],
      },
      sourceCard: CARD_ID,
    }
  },
}

export const E122_Cottar_impl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl
