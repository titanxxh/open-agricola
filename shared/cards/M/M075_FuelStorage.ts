import { defineMinorCard } from '../card-source'

const CARD_ID = 'M075_FuelStorage'

export const M075_FuelStorage = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Fuel Storage",
    deck: "M",
    number: 75,
    category: "GOODS_PROVIDER",
    desc: [
        "Add 1, 3, 5, 7, 9, and 11 to the current round. Alternate placing 1 wood and 1 fuel on the corresponding round spaces, starting with wood. At the start of these rounds, you get the good."
    ],
    cost: {
        "clay": 1,
        "reed": 1
    },
    vp: 1,
    implemented: false,
    requiresFarmersOfTheMoor: true,
  },
})
