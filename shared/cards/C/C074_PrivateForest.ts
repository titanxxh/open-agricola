import { defineMinorCard } from '../card-source'
import { queueFutureMeeples, futureMeeplesNode } from '../../actions/effects/internal/future-meeples'
import type { CardImpl } from '../registry'

const CARD_ID = 'C074_PrivateForest'

const cardImpl = {
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

export const C074_PrivateForest = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Private Forest",
    deck: "C",
    number: 74,
    category: "BUILDING_RESOURCE_PROVIDER",
    desc: ["Place 1 <WOOD> on each remaining even-numbered round space. At the start of these rounds, you get the <WOOD>."],
    cost: { food: 2 },
    prerequisite: "1 Occupation",
    occupationPrerequisites: { min: 1 },
  },
  impl: cardImpl,
})

export const C074_PrivateForest_impl = C074_PrivateForest.impl
