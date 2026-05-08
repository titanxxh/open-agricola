import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { isCardFlagged } from '../helpers/card-state'
import type { CardImpl } from '../registry'
import { B24_Lasso } from '../../cards-display/B/B24_Lasso'

const CARD_ID = B24_Lasso.id

const MARKET_SPACES = ['sheep-market', 'pig-market', 'cattle-market']

const listener: CardListenerRegistration = {
  id: 'B24-lasso-after-place-farmer',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['place-farmer'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (isCardFlagged(context.player, CARD_ID)) return
    const usedMarket = MARKET_SPACES.includes(context.space?.id ?? '')
    if (!usedMarket) return
    // The first farmer used a market: allow placing a second farmer anywhere.
    // Flag the card to prevent recursion.
    return {
      flow: {
        type: 'seq',
        optional: true,
        children: [
          { type: 'leaf', actionId: 'special-effect', sourceCard: CARD_ID, params: { kind: 'set-flag', flag: true } },
          { type: 'leaf', actionId: 'place-farmer', sourceCard: CARD_ID },
          { type: 'leaf', actionId: 'special-effect', sourceCard: CARD_ID, params: { kind: 'set-flag', flag: false } },
        ],
      },
      sourceCard: CARD_ID,
    }
  },
}

export const B24_Lasso_impl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl
