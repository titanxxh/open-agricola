import { defineMinorCard } from '../card-source'
import type { CardImpl } from '../registry'
import { buildPlaceTerrainFlow } from '../../moor/terrain-flow'

const CARD_ID = 'M017_Reforestation'

const cardImpl = {
  effect: {
    id: CARD_ID,
    onBuy: (_state, player) => buildPlaceTerrainFlow(CARD_ID, player, 'forest'),
  },
  reaches: [] as readonly string[],
} satisfies CardImpl

export const M017_Reforestation = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Reforestation",
    deck: "M",
    number: 17,
    category: "FARM_PLANNER",
    desc: [
        "Place 1 <FOREST> on an unused farmyard space."
    ],
    cost: {},
    prerequisite: "3 Major Improvements",
    passing: true,
    implemented: true,
    requiresFarmersOfTheMoor: true,
  },
  impl: cardImpl,
})

export const M017_Reforestation_impl = M017_Reforestation.impl
