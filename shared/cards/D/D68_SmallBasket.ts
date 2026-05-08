import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { payLeaf, gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import { D68_SmallBasket } from '../../cards-display/D/D68_SmallBasket'

const CARD_ID = D68_SmallBasket.id

const listener: CardListenerRegistration = {
  id: 'D68-small-basket-after-place-farmer',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['place-farmer'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.space?.id !== 'reed-bank') return
    const playerCount = context.state.players.length
    if (playerCount >= 4) {
      // Place reed back on space instead of paying
      return {
        flow: {
          type: 'seq',
          optional: true,
          children: [
            {
              type: 'leaf',
              actionId: 'return-to-space',
              params: { reed: 1 },
              sourceCard: CARD_ID,
            },
            gainLeaf(CARD_ID, { vegetable: 1 }),
          ],
        },
        sourceCard: CARD_ID,
      }
    }
    return {
      flow: {
        type: 'seq',
        optional: true,
        children: [
          payLeaf({ cardId: CARD_ID, cost: { reed: 1 } }),
          gainLeaf(CARD_ID, { vegetable: 1 }),
        ],
      },
      sourceCard: CARD_ID,
    }
  },
}

export const D68_SmallBasket_impl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl
