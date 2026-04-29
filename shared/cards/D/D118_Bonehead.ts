import { Occupation } from '../types'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { getCardStack, pushToCardStack } from '../helpers/card-state'
import type { CardImpl } from '../registry'

const CARD_ID = 'D118_Bonehead'

/**
 * After playing an occupation (play-occupation action), give 1 wood from stack.
 */
const afterOccupationListener: CardListenerRegistration = {
  id: 'D118-bonehead-after-occupation',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['play-occupation'],
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
  actions: ['improvement-any', 'minor-improvement'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const stack = getCardStack(context.player, CARD_ID)
    if (stack.length === 0) return
    return {
      flow: { type: 'leaf', actionId: 'pop-card-stack', sourceCard: CARD_ID },
      sourceCard: CARD_ID,
    }
  },
}

export const D118_Bonehead = new Occupation({
  id: CARD_ID,
  name: 'Bonehead',
  deck: 'D',
  number: 118,
  category: 'BUILDING_RESOURCE_PROVIDER',
  desc: ['When you play this card, immediately place 6 <WOOD> on it. Immediately after each time you play a card from your hand, including this one, you get 1 <WOOD> from this card.'],
  cost: {},
  players: '1+',
})

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
