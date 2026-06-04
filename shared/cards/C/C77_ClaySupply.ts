import { defineMinorCard } from '../card-source'
import { queueFutureMeeples, futureMeeplesNode } from '../../actions/effects/internal/future-meeples'
import type { CardImpl } from '../registry'

const CARD_ID = 'C77_ClaySupply'

const cardImpl = {
  effect: {
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
},
  reaches: [] as readonly string[],
} satisfies CardImpl

export const C77_ClaySupply = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Clay Supply",
    deck: "C",
    number: 77,
    category: "BUILDING_RESOURCE_PROVIDER",
    desc: ["Place 1 <CLAY> on each of the next 3 round spaces. At the start of these rounds, you get the <CLAY>."],
    cost: { food: 1 },
  },
  impl: cardImpl,
})

export const C77_ClaySupply_impl = C77_ClaySupply.impl
