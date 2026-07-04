import { defineMinorCard } from '../card-source'
import { queueFutureMeeplesFlow } from '../../actions/effects/internal/future-meeples'
import type { CardImpl } from '../registry'

const CARD_ID = 'M078_Barge'

const cardImpl = {
  effect: {
    id: CARD_ID,
    onBuy: (state, player) => {
      const entries = Array.from(
        { length: Math.max(0, 14 - state.round) },
        (_, index) => ({
          round: state.round + index + 1,
          resources: index % 2 === 0 ? { fuel: 1 } : { food: 1 },
        }),
      )
      if (entries.length === 0) return
      return queueFutureMeeplesFlow(state, {
        cardId: CARD_ID,
        playerId: player.id,
        entries,
      })
    },
  },
  reaches: [] as readonly string[],
} satisfies CardImpl

export const M078_Barge = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Barge",
    deck: "M",
    number: 78,
    category: "GOODS_PROVIDER",
    desc: [
        "Alternate placing 1 <FUEL> and 1 <FOOD> on each remaining round space, starting with <FUEL>. At the start of these rounds, you get the respective good."
    ],
    cost: {
        "wood": 3
    },
    vp: 1,
    prerequisite: "2 Improvements",
    improvementPrerequisites: { min: 2 },
    implemented: true,
    requiresFarmersOfTheMoor: true,
  },
  impl: cardImpl,
})

export const M078_Barge_impl = M078_Barge.impl
