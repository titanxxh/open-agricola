import { defineMinorCard } from '../card-source'
import type { CardImpl } from '../registry'
import { buildCoverTerrainFlow } from '../../moor/terrain-flow'

const CARD_ID = 'M047_BogForest'

const cardImpl = {
  effect: {
    id: CARD_ID,
    onBuy: (_state, player) => buildCoverTerrainFlow(CARD_ID, player, 'moor', 'forest'),
  },
  reaches: [] as readonly string[],
} satisfies CardImpl

export const M047_BogForest = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Bog Forest",
    deck: "M",
    number: 47,
    category: "FARM_PLANNER",
    desc: [
        "Place 1 <FOREST> each on as many of your <MOOR> as you wish. You cannot take the __Slash and Burn__ special action or use the covered <MOOR> on these farmyard spaces unless you remove the <FOREST> with a __Fell Trees__ special action first."
    ],
    cost: {
        "vegetable": 1
    },
    prerequisite: "3 Improvements",
    implemented: true,
    requiresFarmersOfTheMoor: true,
  },
  impl: cardImpl,
})

export const M047_BogForest_impl = M047_BogForest.impl
