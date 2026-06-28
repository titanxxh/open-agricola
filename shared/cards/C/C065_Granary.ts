import { defineMinorCard } from '../card-source'
import { queueFutureMeeples, futureMeeplesNode } from '../../actions/effects/internal/future-meeples'
import type { CardImpl } from '../registry'

const CARD_ID = 'C065_Granary'

const cardImpl = {
  effect: {
  id: CARD_ID,
  onBuy: (state, player) => {
    const targetRounds = [8, 10, 12].filter((r) => r > state.round)
    if (targetRounds.length === 0) return
    queueFutureMeeples(state, {
      cardId: CARD_ID,
      playerId: player.id,
      entries: targetRounds.map((round) => ({ round, resources: { grain: 1 } })),
    })
    return futureMeeplesNode()
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl

export const C065_Granary = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Granary",
    deck: "C",
    number: 65,
    category: "CROP_PROVIDER",
    desc: ["Place 1 <GRAIN> each on the remaining spaces for rounds 8, 10, and 12. At the start of these rounds, you get the <GRAIN>."],
    vp: 1,
    altCosts: [{ wood: 3 }, { clay: 3 }],
  },
  impl: cardImpl,
})

export const C065_Granary_impl = C065_Granary.impl
