import { defineMinorCard } from '../card-source'
import type { ActionFlow } from '../../contract/types'
import type { CardImpl } from '../registry'
import { buildForestToMoorFlow, getTerrainTiles } from '../../moor/terrain-flow'
import { gainLeaf } from '../helpers/pay-gain-node'

const CARD_ID = 'M016_ClearFelling'

const compact = (children: Array<ActionFlow | undefined>): ActionFlow | undefined => {
  const flows = children.filter((flow): flow is ActionFlow => flow !== undefined)
  if (flows.length === 0) return
  return flows.length === 1 ? flows[0] : { type: 'seq', children: flows }
}

const cardImpl = {
  prerequisiteCheck: (player) => getTerrainTiles(player, 'forest').length <= 3,
  effect: {
    id: CARD_ID,
    onBuy: (_state, player) => compact([
      gainLeaf(CARD_ID, { wood: 2 }),
      buildForestToMoorFlow(CARD_ID, player, 2),
    ]),
  },
  reaches: [] as readonly string[],
} satisfies CardImpl

export const M016_ClearFelling = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Clear Felling",
    deck: "M",
    number: 16,
    category: "FARM_PLANNER",
    desc: [
        "You immediately get 2 <WOOD>. On each of up to 2 farmyard spaces containing nothing but exactly 1 forest, you can immediately turn that forest to the moor side."
    ],
    cost: {},
    prerequisite: "At Most 3 Forests",
    passing: true,
    implemented: true,
    requiresFarmersOfTheMoor: true,
  },
  impl: cardImpl,
})

export const M016_ClearFelling_impl = M016_ClearFelling.impl
