import { defineMinorCard } from '../card-source'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import { countTerrain } from './moor-batch1-helpers'

const CARD_ID = 'M088_PeatIron'

const cardImpl = {
  effect: {
    id: CARD_ID,
    onHarvest: (_state, player) => {
      if (countTerrain(player, 'moor') < 2) return
      return gainLeaf(CARD_ID, { fuel: 1 })
    },
  },
  reaches: [] as readonly string[],
} satisfies CardImpl

export const M088_PeatIron = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Peat Iron",
    deck: "M",
    number: 88,
    category: "GOODS_PROVIDER",
    desc: [
        "At the start of each harvest, if you have at least 2 moors, you get 1 fuel."
    ],
    cost: {
        "wood": 1
    },
    implemented: true,
    requiresFarmersOfTheMoor: true,
  },
  impl: cardImpl,
})

export const M088_PeatIron_impl = M088_PeatIron.impl
