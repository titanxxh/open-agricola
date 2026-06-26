import { defineMinorCard } from '../card-source'

const CARD_ID = 'M104_WildHarvest'

export const M104_WildHarvest = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Wild Harvest",
    deck: "M",
    number: 104,
    category: "FOOD_PROVIDER",
    desc: [
        "When you play this card, you immediately get 1 food. At the start of each harvest, shuffle all start cards and draw one. If its number is equal to or lower than the number of forests you have, you immediately get 1 food."
    ],
    cost: {},
    implemented: false,
    requiresFarmersOfTheMoor: true,
  },
})
