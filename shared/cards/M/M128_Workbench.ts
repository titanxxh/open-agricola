import { defineMinorCard } from '../card-source'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'M128_Workbench'

const cardImpl = {
  effect: {
    id: CARD_ID,
    onHarvestFieldPhase: (state) => {
      if (state.round !== 13 && state.round !== 14) return
      return gainLeaf(CARD_ID, { wood: 3, clay: 2, reed: 1 })
    },
  },
  reaches: [] as readonly string[],
} satisfies CardImpl

export const M128_Workbench = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Workbench",
    deck: "M",
    number: 128,
    category: "BUILDING_RESOURCE_PROVIDER",
    desc: [
        "In the field phase of each harvest at the end of rounds 13 and 14, you get 3 <WOOD>, 2 <CLAY>, and 1 <REED>. You can use these, for example, to earn bonus <SCORE> from the Joinery, Pottery, or Basketmaker's Workshop."
    ],
    cost: {
        "wood": 2
    },
    prerequisite: "At Most 4 Improvements",
    improvementPrerequisites: { max: 4 },
    implemented: true,
    requiresFarmersOfTheMoor: true,
  },
  impl: cardImpl,
})

export const M128_Workbench_impl = M128_Workbench.impl
