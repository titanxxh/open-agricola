import { defineMinorCard } from '../card-source'

const CARD_ID = 'M116_MoorBirchTrees'

export const M116_MoorBirchTrees = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Moor Birch Trees",
    deck: "M",
    number: 116,
    category: "BUILDING_RESOURCE_PROVIDER",
    desc: [
        "Each time you take the \"Cut Peat\" special action, you also get 2 wood."
    ],
    cost: {
        "vegetable": 2
    },
    vp: 1,
    prerequisite: "3 Rooms",
    implemented: false,
    requiresFarmersOfTheMoor: true,
  },
})
