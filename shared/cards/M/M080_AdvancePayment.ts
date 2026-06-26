import { defineMinorCard } from '../card-source'

const CARD_ID = 'M080_AdvancePayment'

export const M080_AdvancePayment = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Advance Payment",
    deck: "M",
    number: 80,
    category: "GOODS_PROVIDER",
    desc: [
        "You immediately get 1 fuel, 1 food, 1 wood, 1 clay, 1 reed, 1 stone, 1 sheep, and 1 grain."
    ],
    cost: {},
    vp: -4,
    implemented: false,
    requiresFarmersOfTheMoor: true,
  },
})
