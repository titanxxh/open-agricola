import { defineMinorCard } from '../card-source'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import { allImprovementCount, unusedFarmyardSpaces } from './moor-batch1-helpers'

const CARD_ID = 'M019_LawnTurf'

const cardImpl = {
  prerequisiteCheck: (player) => allImprovementCount(player) >= 4,
  effect: {
    id: CARD_ID,
    onBuy: (_state, player) => {
      const fuel = unusedFarmyardSpaces(player) - 2
      if (fuel < 1 || fuel > 5) return
      return gainLeaf(CARD_ID, { fuel })
    },
  },
  reaches: [] as readonly string[],
} satisfies CardImpl

export const M019_LawnTurf = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Lawn Turf",
    deck: "M",
    number: 19,
    category: "GOODS_PROVIDER",
    desc: [
        "If you have exactly 3/4/5/6/7 unused farmyard spaces, you immediately get 1/2/3/4/5 <FUEL>."
    ],
    cost: {},
    prerequisite: "4 Improvements",
    passing: true,
    implemented: true,
    requiresFarmersOfTheMoor: true,
  },
  impl: cardImpl,
})

export const M019_LawnTurf_impl = M019_LawnTurf.impl
