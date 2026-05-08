import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { getCardStack, pushToCardStack } from '../helpers/card-state'
import { payLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import { B83_MuddyPuddles } from '../../cards-display/B/B83_MuddyPuddles'
export { B83_MuddyPuddles }

const CARD_ID = B83_MuddyPuddles.id

/**
 * Stack order (bottom to top): boar, food, cattle, food, sheep.
 * Player pays 1 clay to take the top good at any time.
 */
const STACK_ITEMS = ['boar', 'food', 'cattle', 'food', 'sheep']

const anytimeListener: CardListenerRegistration = {
  id: 'B83-muddy-puddles-anytime',
  cardIds: [CARD_ID],
  phases: ['anytime' as ActionHookPhase],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const stack = getCardStack(context.player, CARD_ID)
    if (stack.length === 0) return
    if (context.player.resources.clay < 1) return
    return {
      flow: {
        type: 'seq',
        children: [
          payLeaf({ cardId: CARD_ID, cost: { clay: 1 } }),
          { type: 'leaf', actionId: 'pop-card-stack', sourceCard: CARD_ID },
        ],
      },
      sourceCard: CARD_ID,
      labelKey: 'cards.B83_MuddyPuddles.anytime',
    }
  },
}

export const B83_MuddyPuddles_impl = {
  listeners: [anytimeListener],
  effect: {
  id: CARD_ID,
  onBuy: (_state, player) => {
    pushToCardStack(player, CARD_ID, STACK_ITEMS)
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
