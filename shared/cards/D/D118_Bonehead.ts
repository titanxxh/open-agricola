import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { getCardStack, pushToCardStack } from '../helpers/card-state'
import type { CardImpl } from '../registry'
import { D118_Bonehead } from '../../cards-display/D/D118_Bonehead'

const CARD_ID = D118_Bonehead.id

/**
 * After playing an occupation (occupation action), give 1 wood from stack.
 */
const afterOccupationListener: CardListenerRegistration = {
  id: 'D118-bonehead-after-occupation',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['occupation'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const stack = getCardStack(context.player, CARD_ID)
    if (stack.length === 0) return
    return {
      flow: { type: 'leaf', actionId: 'pop-card-stack', sourceCard: CARD_ID },
      sourceCard: CARD_ID,
    }
  },
}

/**
 * After playing an improvement (improvement-any or minor-improvement), give 1 wood.
 */
const afterImprovementListener: CardListenerRegistration = {
  id: 'D118-bonehead-after-improvement',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['improvement'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const stack = getCardStack(context.player, CARD_ID)
    if (stack.length === 0) return
    return {
      flow: { type: 'leaf', actionId: 'pop-card-stack', sourceCard: CARD_ID },
      sourceCard: CARD_ID,
    }
  },
}

export const D118_Bonehead_impl = {
  listeners: [afterOccupationListener, afterImprovementListener],
  effect: {
  id: CARD_ID,
  onBuy: (_state, player) => {
    pushToCardStack(player, CARD_ID, ['wood', 'wood', 'wood', 'wood', 'wood', 'wood'])
    // Return flow to give 1 wood immediately ("including this one")
    return { type: 'leaf', actionId: 'pop-card-stack', sourceCard: CARD_ID }
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
