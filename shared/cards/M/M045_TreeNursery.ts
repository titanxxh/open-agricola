import { defineMinorCard } from '../card-source'

const CARD_ID = 'M045_TreeNursery'

export const M045_TreeNursery = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Tree Nursery",
    deck: "M",
    number: 45,
    category: "FARM_PLANNER",
    desc: [
        "Place 1 forest each on the round spaces 12 and 13. At the start of these rounds, you can place the forest on an unused farmyard space."
    ],
    cost: {
        "wood": 1
    },
    prerequisite: "No Improvements",
    implemented: false,
    requiresFarmersOfTheMoor: true,
  },
})
