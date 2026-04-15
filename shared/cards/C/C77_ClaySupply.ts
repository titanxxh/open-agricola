import { MinorImprovement } from '../types'
import { registerCardEffect } from '../card-effects'
import { queueFutureMeeples, futureMeeplesNode } from '../../actions/effects/future-meeples'

const CARD_ID = 'C77_ClaySupply'

registerCardEffect({
  id: CARD_ID,
  onBuy: (state, player) => {
    queueFutureMeeples(state, {
      cardId: CARD_ID,
      playerId: player.id,
      startRound: state.round + 1,
      count: 3,
      resources: { clay: 1 },
    })
    return futureMeeplesNode()
  },
})

export const C77_ClaySupply = new MinorImprovement({
  id: CARD_ID,
  name: "Clay Supply",
  deck: "C",
  number: 77,
  category: "RESOURCE_CLAY",
  desc: ["Place 1 <CLAY> on each of the next 3 round spaces. At the start of these rounds, you get the <CLAY>."],
  cost: { food: 1 },
})
