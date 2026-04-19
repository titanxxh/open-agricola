import { MinorImprovement } from '../types'
import { registerCardListener } from '../card-listeners'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { payGainNode } from '../helpers/pay-gain-node'

const CARD_ID = 'C61_BeerStein'

// C61 Beer Stein: Each time you take a Bake Bread action, you can use this card once
// to turn 1 GRAIN into 2 FOOD and 1 bonus SCORE.
// BGA: isActionEvent($event, 'Exchange') && $event['trigger'] == BREAD
const listener: CardListenerRegistration = {
  id: 'C61-beer-stein-after-bake-bread',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['bake-bread'],
  handler: (_context: CardListenerContext): ActionHookResult | void => {
    return payGainNode({
      cardId: CARD_ID,
      cost: { grain: 1 },
      gain: { food: 2, score: 1 },
    })
  },
}

registerCardListener(listener)

export const C61_BeerStein = new MinorImprovement({
  id: CARD_ID,
  name: 'Beer Stein',
  deck: 'C',
  number: 61,
  category: 'FOOD_PROVIDER',
  desc: [
    'Each time you take a __Bake Bread__ action, you can use this card once to turn 1 <GRAIN> into 2 <FOOD> and 1 bonus <SCORE>.',
  ],
  cost: { clay: 1 },
  newSet: true,
})
