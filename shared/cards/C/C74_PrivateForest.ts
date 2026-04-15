import { MinorImprovement } from '../types'
import { registerCardEffect } from '../card-effects'
import { queueFutureMeeples, futureMeeplesNode } from '../../actions/effects/future-meeples'

const CARD_ID = 'C74_PrivateForest'

registerCardEffect({
  id: CARD_ID,
  onBuy: (state, player) => {
    const evenRounds = [2, 4, 6, 8, 10, 12, 14].filter((r) => r > state.round)
    if (evenRounds.length === 0) return
    queueFutureMeeples(state, {
      cardId: CARD_ID,
      playerId: player.id,
      entries: evenRounds.map((round) => ({ round, resources: { wood: 1 } })),
    })
    return futureMeeplesNode()
  },
})

export const C74_PrivateForest = new MinorImprovement({
  id: CARD_ID,
  name: "Private Forest",
  deck: "C",
  number: 74,
  category: "RESOURCE_WOOD",
  desc: ["Place 1 <WOOD> on each remaining even-numbered round space. At the start of these rounds, you get the <WOOD>."],
  cost: { food: 2 },
  prerequisite: "1 Occupation",
  occupationPrerequisites: { min: 1 },
})
