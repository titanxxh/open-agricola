import { defineMinorCard } from '../card-source'

const CARD_ID = 'M127_Wheelbarrow'

export const M127_Wheelbarrow = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Wheelbarrow",
    deck: "M",
    number: 127,
    category: "BUILDING_RESOURCE_PROVIDER",
    desc: [
        "Each time you take at least 4 of the same building resource from an accumulation space, you also get 1 fuel. Each time you take the \"Cut Peat\" special action, you also get 1 building resource of your choice."
    ],
    cost: {
        "wood": 2
    },
    prerequisite: "1 Major Improvement",
    implemented: false,
    requiresFarmersOfTheMoor: true,
  },
})
