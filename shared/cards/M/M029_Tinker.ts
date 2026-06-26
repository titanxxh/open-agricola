import { defineMinorCard } from '../card-source'

const CARD_ID = 'M029_Tinker'

export const M029_Tinker = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Tinker",
    deck: "M",
    number: 29,
    category: "ACTIONS_BOOSTER",
    desc: [
        "If you have at least one of the \"Joinery\", \"Pottery\", or \"Basketmaker's Workshop\" major improvements, you immediately get 1 <WOOD>, 1 <CLAY>, 1 <REED>, and 1 <STONE>."
    ],
    cost: {
        "food": 1
    },
    prerequisite: "3 Major Improvements",
    passing: true,
    implemented: false,
    requiresFarmersOfTheMoor: true,
  },
})
