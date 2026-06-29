import { defineMinorCard } from '../card-source'
import type { CardImpl } from '../registry'
import { buildCoverTerrainFlow } from '../../moor/terrain-flow'

const CARD_ID = 'M046_Thicket'

const cardImpl = {
  effect: {
    id: CARD_ID,
    onBuy: (_state, player) => buildCoverTerrainFlow(CARD_ID, player, 'forest', 'forest', 2),
  },
  reaches: [] as readonly string[],
} satisfies CardImpl

export const M046_Thicket = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Thicket",
    deck: "M",
    number: 46,
    category: "FARM_PLANNER",
    desc: [
        "Choose up to 2 of your forests and place 1 additional forest on top of each of them. You cannot take the \"Slash and Burn\" special action on these farmyard spaces unless you remove a tile with a \"Fell Trees\" special action first."
    ],
    cost: {},
    prerequisite: "4 Forests",
    implemented: true,
    requiresFarmersOfTheMoor: true,
  },
  impl: cardImpl,
})

export const M046_Thicket_impl = M046_Thicket.impl
