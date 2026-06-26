import { defineMinorCard } from '../card-source'

const CARD_ID = 'M093_FarmhandsQuarters'

export const M093_FarmhandsQuarters = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Farmhands' Quarters",
    deck: "M",
    number: 93,
    category: "GOODS_PROVIDER",
    desc: [
        "Each time you build a major improvement, you can replace 1 building resource of your choice with 1 fuel. Each time you get an improvement in your hand from the player to your right, you also get 1 food."
    ],
    cost: {
        "wood": 1,
        "reed": 1
    },
    implemented: false,
    requiresFarmersOfTheMoor: true,
  },
})
