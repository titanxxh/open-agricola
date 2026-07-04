import { defineMinorCard } from '../card-source'
import type { CardImpl } from '../registry'

const CARD_ID = 'M116_MoorBirchTrees'

const cardImpl = {
  prerequisiteCheck: (player) => player.rooms >= 3,
  reaches: [] as readonly string[],
} satisfies CardImpl

export const M116_MoorBirchTrees = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Moor Birch Trees",
    deck: "M",
    number: 116,
    category: "BUILDING_RESOURCE_PROVIDER",
    desc: [
        "Each time you take the __Cut Peat__ special action, you also get 2 <WOOD>."
    ],
    cost: {
        "vegetable": 2
    },
    vp: 1,
    prerequisite: "3 Rooms",
    implemented: true,
    requiresFarmersOfTheMoor: true,
    moorSpecialActionBonuses: [
      { actionId: 'cut-peat', resource: 'wood', amount: 2 },
    ],
  },
  impl: cardImpl,
})

export const M116_MoorBirchTrees_impl = M116_MoorBirchTrees.impl
