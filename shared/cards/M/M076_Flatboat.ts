import { defineMinorCard } from '../card-source'
import { queueFutureMeeplesFlow } from '../../actions/effects/internal/future-meeples'
import type { CardImpl } from '../registry'

const CARD_ID = 'M076_Flatboat'

const cardImpl = {
  effect: {
    id: CARD_ID,
    onBuy: (state, player) => {
      const entries = Array.from({ length: 7 }, (_, index) => ({
        round: state.round + index + 1,
        resources: index % 2 === 0 ? { fuel: 1 } : { horse: 1 },
      })).filter((entry) => entry.round <= 14)
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

export const M076_Flatboat = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Flatboat",
    deck: "M",
    number: 76,
    category: "GOODS_PROVIDER",
    desc: [
        "Alternate placing 1 <FUEL> and 1 <HORSE> on each of the next 7 round spaces, starting with <FUEL>. At the start of these rounds, you get the respective good."
    ],
    cost: {
        "wood": 4
    },
    implemented: true,
    requiresFarmersOfTheMoor: true,
  },
  impl: cardImpl,
})

export const M076_Flatboat_impl = M076_Flatboat.impl
