import { defineMinorCard } from '../card-source'

const CARD_ID = 'M024_BasicSupplies'

export const M024_BasicSupplies = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Basic Supplies",
    deck: "M",
    number: 24,
    category: "GOODS_PROVIDER",
    desc: [
        "You immediately get goods until you have at least 1 <FUEL>, 1 <FOOD>, 1 <WOOD>, 1 <CLAY>, 1 <REED>, 1 <STONE>, and 1 <GRAIN> in your supply."
    ],
    cost: {
        "wood": 1
    },
    passing: true,
    implemented: false,
    requiresFarmersOfTheMoor: true,
  },
})
