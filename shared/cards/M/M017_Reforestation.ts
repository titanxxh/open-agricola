import { defineMinorCard } from '../card-source'

const CARD_ID = 'M017_Reforestation'

export const M017_Reforestation = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Reforestation",
    deck: "M",
    number: 17,
    category: "FARM_PLANNER",
    desc: [
        "Place 1 forest on an unused farmyard space."
    ],
    cost: {},
    prerequisite: "3 Major Improvements",
    passing: true,
    implemented: false,
    requiresFarmersOfTheMoor: true,
  },
})
