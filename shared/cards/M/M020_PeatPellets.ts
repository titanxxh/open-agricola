import { defineMinorCard } from '../card-source'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import { countTerrain } from './moor-batch1-helpers'

const CARD_ID = 'M020_PeatPellets'

const cardImpl = {
  effect: {
    id: CARD_ID,
    onBuy: (_state, player) => {
      const fuel = countTerrain(player, 'moor')
      if (fuel === 0) return
      return gainLeaf(CARD_ID, { fuel })
    },
  },
  reaches: [] as readonly string[],
} satisfies CardImpl

export const M020_PeatPellets = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Peat Pellets",
    deck: "M",
    number: 20,
    category: "GOODS_PROVIDER",
    desc: [
        "You immediately get 1 <FUEL> for each visible <MOOR> that you have."
    ],
    cost: {},
    prerequisite: "1 Major Improvement",
    passing: true,
    implemented: true,
    requiresFarmersOfTheMoor: true,
  },
  impl: cardImpl,
})

export const M020_PeatPellets_impl = M020_PeatPellets.impl
