import { defineMinorCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { getCardStack, pushToCardStack } from '../helpers/card-state'
import { payLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'B083_MuddyPuddles'
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
      labelKey: 'cards.B083_MuddyPuddles.anytime',
    }
  },
}

const cardImpl = {
  listeners: [anytimeListener],
  effect: {
  id: CARD_ID,
  onBuy: (_state, player) => {
    pushToCardStack(player, CARD_ID, STACK_ITEMS)
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl

export const B083_MuddyPuddles = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: 'Muddy Puddles',
    deck: 'B',
    number: 83,
    category: 'LIVESTOCK_PROVIDER',
    desc: ['Pile (from bottom to top) 1 <PIG>, 1 <FOOD>, 1 <CATTLE>, 1 <FOOD>, and 1 <SHEEP> on this card. At any time, you can pay 1 <CLAY> to take the top good.'],
    cost: { clay: 2 },
    players: '1+',
  },
  presentation: { stack: true },
  impl: cardImpl,
})

export const B083_MuddyPuddles_impl = B083_MuddyPuddles.impl
