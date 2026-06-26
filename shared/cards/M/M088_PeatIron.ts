import { defineMinorCard } from '../card-source'

const CARD_ID = 'M088_PeatIron'

export const M088_PeatIron = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Peat Iron",
    deck: "M",
    number: 88,
    category: "GOODS_PROVIDER",
    desc: [
        "At the start of each harvest, if you have at least 2 moors, you get 1 fuel."
    ],
    cost: {
        "wood": 1
    },
    implemented: false,
    requiresFarmersOfTheMoor: true,
  },
})
