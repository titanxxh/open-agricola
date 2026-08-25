import { defineOccupationCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { getCardStack, pushToCardStack } from '../helpers/card-state'
import { payLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'A102_Grocer'
/**
 * Stack order (bottom to top): wood, grain, reed, stone, vegetable, clay, reed, vegetable
 * Player pays 1 food to take the top good at any time.
 */
const STACK_ITEMS = ['wood', 'grain', 'reed', 'stone', 'vegetable', 'clay', 'reed', 'vegetable']

const anytimeListener: CardListenerRegistration = {
  id: 'A102-grocer-anytime',
  cardIds: [CARD_ID],
  phases: ['anytime' as ActionHookPhase],
  preScoring: true,
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const stack = getCardStack(context.player, CARD_ID)
    if (stack.length === 0) return
    if (context.player.resources.food < 1) return
    return {
      flow: {
        type: 'seq',
        children: [
          payLeaf({ cardId: CARD_ID, cost: { food: 1 } }),
          { type: 'leaf', actionId: 'pop-card-stack', sourceCard: CARD_ID },
        ],
      },
      sourceCard: CARD_ID,
      labelKey: 'cards.A102_Grocer.anytime',
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

export const A102_Grocer = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Grocer',
    deck: 'A',
    number: 102,
    category: 'GOODS_PROVIDER',
    desc: ['Pile the following goods on this card (<WOOD>, <GRAIN>, <REED>, <STONE>, <VEGETABLE>, <CLAY>, <REED>, <VEGETABLE>). At any time, you can buy the top good for 1 <FOOD>.'],
    cost: {},
    players: '1+',
  },
  impl: cardImpl,
})

export const A102_Grocer_impl = A102_Grocer.impl
