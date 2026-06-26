import { defineMinorCard } from '../card-source'

const CARD_ID = 'M082_Firewood'

export const M082_Firewood = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Firewood",
    deck: "M",
    number: 82,
    category: "GOODS_PROVIDER",
    desc: [
        "When you play this card, you immediately get 1 fuel. During each harvest, if you exchange at least 1 wood for 1 fuel to heat your house, you need a total of 1 fuel less to heat it."
    ],
    cost: {
        "wood": 1
    },
    prerequisite: "1 Major Improvement",
    implemented: false,
    requiresFarmersOfTheMoor: true,
  },
})
