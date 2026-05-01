import { MinorImprovement } from '../types'
import { queueFutureMeeples, futureMeeplesNode } from '../../actions/effects/internal/future-meeples'
import type { CardImpl } from '../registry'

const CARD_ID = 'C74_PrivateForest'

export const C74_PrivateForest = new MinorImprovement({
  id: CARD_ID,
  name: "Private Forest",
  deck: "C",
  number: 74,
  category: "BUILDING_RESOURCE_PROVIDER",
  desc: ["Place 1 <WOOD> on each remaining even-numbered round space. At the start of these rounds, you get the <WOOD>."],
  cost: { food: 2 },
  prerequisite: "1 Occupation",
  occupationPrerequisites: { min: 1 },
})

export const C74_PrivateForest_impl = {
  effect: {
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
},
  reaches: [] as readonly string[],
} satisfies CardImpl
