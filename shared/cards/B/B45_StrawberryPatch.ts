import { MinorImprovement } from '../types'
import { registerCardEffect } from '../card-effects'
import { queueFutureMeeplesFlow } from '../../actions/effects/future-meeples'

const CARD_ID = 'B45_StrawberryPatch'

registerCardEffect({
  id: CARD_ID,
  onBuy: (state, player) => {
    return queueFutureMeeplesFlow(state, {
      cardId: CARD_ID,
      playerId: player.id,
      startRound: state.round + 1,
      count: 3,
      resources: { food: 1 },
    })
  },
})

export const B45_StrawberryPatch = new MinorImprovement({
  id: CARD_ID,
  name: 'Strawberry Patch',
  deck: 'B',
  number: 45,
  category: 'FOOD_MISC',
  desc: ['Place 1 <FOOD> on each of the next 3 round spaces. At the start of these rounds, you get the <FOOD>.'],
  cost: { wood: 1 },
  vp: 2,
  prerequisite: '2 Vegetable Fields',
})
