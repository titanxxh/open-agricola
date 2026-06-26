import { defineMinorCard } from '../card-source'

const CARD_ID = 'M094_PeatBath'

export const M094_PeatBath = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Peat Bath",
    deck: "M",
    number: 94,
    category: "FOOD_PROVIDER",
    desc: [
        "Each time you use the \"Infirmary\" action space, place 1 food on as many of the next round spaces as there are moors visible on your farmyard board. At the start of these rounds, you get the food."
    ],
    cost: {
        "wood": 1,
        "clay": 1
    },
    vp: 1,
    implemented: false,
    requiresFarmersOfTheMoor: true,
  },
})
