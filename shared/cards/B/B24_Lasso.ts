import { MinorImprovement } from '../types'
import { registerCardListener } from '../card-listeners'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { isCardFlagged } from '../helpers/card-state'

const CARD_ID = 'B24_Lasso'

const MARKET_SPACES = ['sheep-market', 'pig-market', 'cattle-market']

// B24 Lasso: Place two farmers immediately after one another if at least one
// uses sheep-market, pig-market, or cattle-market.
// The flag prevents Lasso from triggering again for the second farmer.
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
          { type: 'leaf', actionId: 'flag-card', sourceCard: CARD_ID },
          { type: 'leaf', actionId: 'place-farmer', sourceCard: CARD_ID },
          { type: 'leaf', actionId: 'unflag-card', sourceCard: CARD_ID },
        ],
      },
      sourceCard: CARD_ID,
    }
  },
}

registerCardListener(listener)

export const B24_Lasso = new MinorImprovement({
  id: CARD_ID,
  name: 'Lasso',
  deck: 'B',
  number: 24,
  category: 'ACTIONS_BOOSTER',
  desc: ['You can place exactly two people immediately after one another if at least one of them uses the __Sheep Market__, __Pig Market__, or __Cattle Market__ accumulation space.'],
  cost: { reed: 1 },
})
