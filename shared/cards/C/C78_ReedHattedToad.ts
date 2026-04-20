import { MinorImprovement } from '../types'
import { queueFutureMeeples, futureMeeplesNode } from '../../actions/effects/future-meeples'
import type { CardImpl } from '../registry'

const CARD_ID = 'C78_ReedHattedToad'

export const C78_ReedHattedToad = new MinorImprovement({
  id: CARD_ID,
  name: "Reed-Hatted Toad",
  deck: "C",
  number: 78,
  category: "RESOURCE_REED",
  desc: ["Add 5, 7, 9, 11, and 13 to the current round and place 1 <REED> on each corresponding round space. At the start of these rounds, you get the <REED>."],
  cost: { food: 1 },
})

export const C78_ReedHattedToad_impl = {
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
