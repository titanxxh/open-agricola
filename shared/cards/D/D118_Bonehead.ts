import { defineOccupationCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { getCardStack, pushToCardStack } from '../helpers/card-state'
import type { CardImpl } from '../registry'

const CARD_ID = 'D118_Bonehead'
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

const cardImpl = {
  listeners: [afterOccupationListener, afterImprovementListener],
  effect: {
  id: CARD_ID,
  onBuy: (_state, player) => {
    pushToCardStack(player, CARD_ID, ['wood', 'wood', 'wood', 'wood', 'wood', 'wood'])
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl

export const D118_Bonehead = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Bonehead',
    deck: 'D',
    number: 118,
    category: 'BUILDING_RESOURCE_PROVIDER',
    desc: ['When you play this card, immediately place 6 <WOOD> on it. Immediately after each time you play a card from your hand, including this one, you get 1 <WOOD> from this card.'],
    cost: {},
    players: '1+',
  },
  presentation: { stack: true },
  impl: cardImpl,
})

export const D118_Bonehead_impl = D118_Bonehead.impl
