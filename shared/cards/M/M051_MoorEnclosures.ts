import { defineMinorCard } from '../card-source'

const CARD_ID = 'M051_MoorEnclosures'

export const M051_MoorEnclosures = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Moor Enclosures",
    deck: "M",
    number: 51,
    category: "FARM_PLANNER",
    desc: [
        "Place a farmyard extension at one of the four sides of your farmyard board and place 1 moor on each of the 2 new farmyard spaces. Both new farmyard spaces must be adjacent to existing farmyard spaces."
    ],
    cost: {
        "stone": 1
    },
    vp: 1,
    prerequisite: "Clay House",
    implemented: false,
    requiresFarmersOfTheMoor: true,
  },
})
