import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { ActionFlow } from '../../contract/types'
import { isCardFlagged } from '../helpers/card-state'
import { workersAvailable } from '../../domain/player'
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
    if (workersAvailable(context.state, context.player) <= 0) return
    const usedMarket = MARKET_SPACES.includes(context.space?.id ?? '')
    const placeFarmer: Extract<ActionFlow, { type: 'leaf' }> = {
      type: 'leaf',
      actionId: 'place-farmer',
      sourceCard: CARD_ID,
    }
    if (!usedMarket) {
      placeFarmer.actionContext = { constraints: MARKET_SPACES }
    }
    return {
      flow: {
        type: 'seq',
        optional: true,
        children: [
          { type: 'leaf', actionId: 'special-effect', sourceCard: CARD_ID, params: { kind: 'set-flag', flag: true } },
          placeFarmer,
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
