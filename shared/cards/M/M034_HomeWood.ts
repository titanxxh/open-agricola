import { defineMinorCard } from '../card-source'

const CARD_ID = 'M034_HomeWood'

export const M034_HomeWood = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Home Wood",
    deck: "M",
    number: 34,
    category: "FARM_PLANNER",
    desc: [
        "You can keep exactly 1 animal, except sheep, on each farmyard space containing at least 1 forest."
    ],
    cost: {},
    prerequisite: "3 Improvements",
    implemented: false,
    requiresFarmersOfTheMoor: true,
  },
})
