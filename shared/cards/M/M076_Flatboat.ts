import { defineMinorCard } from '../card-source'

const CARD_ID = 'M076_Flatboat'

export const M076_Flatboat = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Flatboat",
    deck: "M",
    number: 76,
    category: "GOODS_PROVIDER",
    desc: [
        "Alternate placing 1 fuel and 1 horse on each of the next 7 round spaces, starting with fuel. At the start of these rounds, you get the respective good."
    ],
    cost: {
        "wood": 4
    },
    implemented: false,
    requiresFarmersOfTheMoor: true,
  },
})
