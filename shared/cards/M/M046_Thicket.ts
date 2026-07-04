import { defineMinorCard } from '../card-source'
import type { CardImpl } from '../registry'
import { buildCoverTerrainFlow } from '../../moor/terrain-flow'

const CARD_ID = 'M046_Thicket'

const cardImpl = {
  effect: {
    id: CARD_ID,
    onBuy: (_state, player) => buildCoverTerrainFlow(CARD_ID, player, 'forest', 'forest', 2),
  },
  prerequisiteCheck: (player) =>
    (player.farmTerrain ?? []).filter((tile) => tile.kind === 'forest').length >= 4,
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
        "Choose up to 2 of your <FOREST> and place 1 additional <FOREST> on top of each of them. You cannot take the __Slash and Burn__ special action on these farmyard spaces unless you remove a tile with a __Fell Trees__ special action first."
    ],
    cost: {},
    prerequisite: "4 Forests",
    implemented: true,
    requiresFarmersOfTheMoor: true,
  },
  impl: cardImpl,
})

export const M046_Thicket_impl = M046_Thicket.impl
