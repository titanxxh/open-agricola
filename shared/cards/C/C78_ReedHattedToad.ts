import { defineMinorCard } from '../card-source'
import { queueFutureMeeples, futureMeeplesNode } from '../../actions/effects/internal/future-meeples'
import type { CardImpl } from '../registry'

const CARD_ID = 'C78_ReedHattedToad'

const cardImpl = {
  effect: {
  id: CARD_ID,
  onBuy: (state, player) => {
    // Place 1 reed on rounds at offsets +5, +7, +9, +11, +13 from current round
    const offsets = [5, 7, 9, 11, 13]
    const entries = offsets
      .map((offset) => ({ round: state.round + offset, resources: { reed: 1 } }))
      .filter((e) => e.round <= 14)
    if (entries.length === 0) return
    queueFutureMeeples(state, {
      cardId: CARD_ID,
      playerId: player.id,
      entries,
    })
    return futureMeeplesNode()
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl

export const C78_ReedHattedToad = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Reed-Hatted Toad",
    deck: "C",
    number: 78,
    category: "BUILDING_RESOURCE_PROVIDER",
    desc: ["Add 5, 7, 9, 11, and 13 to the current round and place 1 <REED> on each corresponding round space. At the start of these rounds, you get the <REED>."],
    cost: { food: 1 },
  },
  impl: cardImpl,
})

export const C78_ReedHattedToad_impl = C78_ReedHattedToad.impl
