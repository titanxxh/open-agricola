import { defineMinorCard } from '../card-source'
import type { CardImpl } from '../registry'
import { countTerrainAdjacencies } from '../../moor/terrain-adjacency'
import { gainLeaf } from '../helpers/pay-gain-node'

const CARD_ID = 'M023_EdgeOfTheForest'

const cardImpl = {
  effect: {
    id: CARD_ID,
    onBuy: (_state, player) => {
      const { forestField, forestMoor } = countTerrainAdjacencies(player)
      if (forestField === 0 && forestMoor === 0) return
      return gainLeaf(CARD_ID, { food: forestField, fuel: forestMoor })
    },
  },
  reaches: [] as readonly string[],
} satisfies CardImpl

export const M023_EdgeOfTheForest = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Edge of the Forest",
    deck: "M",
    number: 23,
    category: "GOODS_PROVIDER",
    desc: [
        "You immediately get 1 <FOOD> for each of your <FENCE> spaces between a <FOREST> and a <FIELD>, and 1 <FUEL> for each of your <FENCE> spaces between a <FOREST> and a <MOOR>."
    ],
    cost: {},
    prerequisite: "3 Improvements",
    passing: true,
    implemented: true,
    requiresFarmersOfTheMoor: true,
  },
  impl: cardImpl,
})

export const M023_EdgeOfTheForest_impl = M023_EdgeOfTheForest.impl
