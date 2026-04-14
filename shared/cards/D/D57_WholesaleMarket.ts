import { MinorImprovement } from '../types'
import { registerCardEffect } from '../card-effects'
import { queueFutureMeeplesFlow } from '../../actions/effects/future-meeples'

const CARD_ID = 'D57_WholesaleMarket'

registerCardEffect({
  id: CARD_ID,
  onBuy: (state, player) => {
    // Place 1 food on each remaining round space (all remaining rounds up to 14)
    const count = 14 - state.round
    if (count <= 0) return
    return queueFutureMeeplesFlow(state, {
      cardId: CARD_ID,
      playerId: player.id,
      startRound: state.round + 1,
      count,
      resources: { food: 1 },
    })
  },
})

export const D57_WholesaleMarket = new MinorImprovement({
  id: CARD_ID,
  name: 'Wholesale Market',
  deck: 'D',
  number: 57,
  category: 'FOOD_PROVIDER',
  desc: ['Place 1 <FOOD> on each remaining round space. At the start of these rounds, you get the <FOOD>.'],
  cost: { wood: 2, vegetable: 2 },
  vp: 3,
  newSet: true,
})
