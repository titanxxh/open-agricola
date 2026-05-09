import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import { C142_MarketCrier } from '../../cards-display/C/C142_MarketCrier'

const CARD_ID = C142_MarketCrier.id

/**
 * After placing farmer on Grain Seeds: optionally gain 1 grain + 1 vegetable,
 * and if you do, each other player gets 1 grain.
 */
const listener: CardListenerRegistration = {
  id: 'C142-market-crier-after-grain-seeds',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['place-farmer'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.space?.id !== 'grain-seeds') return
    return {
      flow: {
        type: 'seq',
        optional: true,
        children: [
          gainLeaf(CARD_ID, { grain: 1, vegetable: 1 }),
          { type: 'leaf', actionId: 'gain', params: { recipientMode: 'others', grain: 1 }, sourceCard: CARD_ID },
        ],
      },
      sourceCard: CARD_ID,
    }
  },
}

export const C142_MarketCrier_impl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl
