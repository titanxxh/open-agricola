import { defineMinorCard } from '../card-source'
import { queueFutureMeeplesFlow } from '../../actions/effects/internal/future-meeples'
import type { CardImpl } from '../registry'

const CARD_ID = 'M075_FuelStorage'

const cardImpl = {
  effect: {
    id: CARD_ID,
    onBuy: (state, player) => {
      const entries = [1, 3, 5, 7, 9, 11]
        .map((offset, index) => ({
          round: state.round + offset,
          resources: index % 2 === 0 ? { wood: 1 } : { fuel: 1 },
        }))
        .filter((entry) => entry.round <= 14)
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

export const M075_FuelStorage = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Fuel Storage",
    deck: "M",
    number: 75,
    category: "GOODS_PROVIDER",
    desc: [
        "Add 1, 3, 5, 7, 9, and 11 to the current round. Alternate placing 1 <WOOD> and 1 <FUEL> on the corresponding round spaces, starting with <WOOD>. At the start of these rounds, you get the good."
    ],
    cost: {
        "clay": 1,
        "reed": 1
    },
    vp: 1,
    implemented: true,
    requiresFarmersOfTheMoor: true,
  },
  impl: cardImpl,
})

export const M075_FuelStorage_impl = M075_FuelStorage.impl
