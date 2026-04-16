import { MinorImprovement } from '../types'
import { registerCardEffect } from '../card-effects'
import { queueFutureMeeples, futureMeeplesNode } from '../../actions/effects/future-meeples'

const CARD_ID = 'C48_Farmstead'

/**
 * C48 Farmstead (MinorImprovement, C, 48)
 * When you play this card, place 1 food on each of the next 5 round spaces.
 * At the start of these rounds, you get the food.
 */
registerCardEffect({
  id: CARD_ID,
  onBuy: (state, player) => {
    queueFutureMeeples(state, {
      cardId: CARD_ID,
      playerId: player.id,
      startRound: state.round + 1,
      count: 5,
      resources: { food: 1 },
    })
    return futureMeeplesNode()
  },
})

export const C48_Farmstead = new MinorImprovement({
  id: CARD_ID,
  name: 'Farmstead',
  deck: 'C',
  number: 48,
  category: 'FOOD_PROVIDER',
  desc: ['After each turn in which you make at least one unused farmyard space used, you get 1 <FOOD>.'],
  cost: { wood: 1, clay: 1 },
  implemented: true,
})
