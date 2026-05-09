import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { getCardStack, pushToCardStack } from '../helpers/card-state'
import type { CardImpl } from '../registry'
import { E40_BeeStatue } from '../../cards-display/E/E40_BeeStatue'

const CARD_ID = E40_BeeStatue.id

/**
 * Stack order (bottom to top): vegetable, stone, grain, stone, grain.
 * Each time the owner uses Day Laborer, automatically take the top good.
 */
const STACK_ITEMS = ['vegetable', 'stone', 'grain', 'stone', 'grain']

const afterPlaceFarmerListener: CardListenerRegistration = {
  id: 'E40-bee-statue-after-place-farmer',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['place-farmer'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.space?.id !== 'day-laborer') return
    const stack = getCardStack(context.player, CARD_ID)
    if (stack.length === 0) return
    return {
      flow: { type: 'leaf', actionId: 'pop-card-stack', sourceCard: CARD_ID },
      sourceCard: CARD_ID,
    }
  },
}

export const E40_BeeStatue_impl = {
  listeners: [afterPlaceFarmerListener],
  effect: {
  id: CARD_ID,
  onBuy: (_state, player) => {
    pushToCardStack(player, CARD_ID, STACK_ITEMS)
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
