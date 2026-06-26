import { defineMinorCard } from '../card-source'

const CARD_ID = 'M050_FarmExtension'

export const M050_FarmExtension = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Farm Extension",
    deck: "M",
    number: 50,
    category: "FARM_PLANNER",
    desc: [
        "Place a farmyard extension at one of the four sides of your farmyard board. Both new farmyard spaces must be adjacent to existing farmyard spaces."
    ],
    cost: {
        "clay": 1
    },
    vp: 1,
    implemented: false,
    requiresFarmersOfTheMoor: true,
  },
})
