import { defineMinorCard } from '../card-source'
import type { CardImpl } from '../registry'

const CARD_ID = 'M073_StockBreedingPrize'

const cardImpl = {
  effect: {
    id: CARD_ID,
    computeBonusScore: (state, player) => {
      const sets = Math.min(
        player.resources.sheep ?? 0,
        player.resources.boar ?? 0,
        player.resources.cattle ?? 0,
        player.resources.horse ?? 0,
        3,
      )
      return sets * Math.max(0, state.players.length - 1)
    },
  },
  reaches: [] as readonly string[],
} satisfies CardImpl

export const M073_StockBreedingPrize = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Stock-Breeding Prize",
    deck: "M",
    number: 73,
    category: "POINTS_PROVIDER",
    desc: [
        "During scoring, if you have at least 1 animal of each of the 4 types, you get 1 bonus point for each other player in the game. These points are doubled or tripled if you have 2 or 3 animals of each type, respectively."
    ],
    cost: {
        "sheep": 1
    },
    extraVp: true,
    prerequisite: "No Unused Farmyard Spaces",
    implemented: true,
    requiresFarmersOfTheMoor: true,
  },
  impl: cardImpl,
})

export const M073_StockBreedingPrize_impl = M073_StockBreedingPrize.impl
