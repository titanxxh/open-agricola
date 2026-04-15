import { Occupation } from '../types'
import { registerCardEffect } from '../card-effects'
import { registerCardListener } from '../card-listeners'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { getCardStack, pushToCardStack } from '../helpers/card-state'

const CARD_ID = 'D118_Bonehead'

/**
 * When you play this card, immediately place 6 wood on it.
 * Immediately after each time you play a card from your hand,
 * including this one, you get 1 wood from this card.
 *
 * onBuy: push 6 wood to stack, return pop-card-stack flow to give 1 wood immediately.
 * Listeners: after playing an occupation or improvement, pop 1 wood.
 */
registerCardEffect({
  id: CARD_ID,
  onBuy: (_state, player) => {
    pushToCardStack(player, CARD_ID, ['wood', 'wood', 'wood', 'wood', 'wood', 'wood'])
    // Return flow to give 1 wood immediately ("including this one")
    return { type: 'leaf', actionId: 'pop-card-stack', sourceCard: CARD_ID }
  },
})

/**
 * After playing an occupation (play-occupation action), give 1 wood from stack.
 */
const afterOccupationListener: CardListenerRegistration = {
  id: 'D118-bonehead-after-occupation',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['play-occupation'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!context.player.occupationPlayed.includes(CARD_ID)) return
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
    if (!context.player.occupationPlayed.includes(CARD_ID)) return
    const stack = getCardStack(context.player, CARD_ID)
    if (stack.length === 0) return
    return {
      flow: { type: 'leaf', actionId: 'pop-card-stack', sourceCard: CARD_ID },
      sourceCard: CARD_ID,
    }
  },
}

registerCardListener(afterOccupationListener)
registerCardListener(afterImprovementListener)

export const D118_Bonehead = new Occupation({
  id: CARD_ID,
  name: 'Bonehead',
  deck: 'D',
  number: 118,
  category: 'GOODS_PROVIDER',
  desc: ['When you play this card, immediately place 6 <WOOD> on it. Immediately after each time you play a card from your hand, including this one, you get 1 <WOOD> from this card.'],
  cost: {},
  players: '1+',
})
