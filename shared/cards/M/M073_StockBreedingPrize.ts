import { defineMinorCard } from '../card-source'

const CARD_ID = 'M073_StockBreedingPrize'

export const M073_StockBreedingPrize = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Stock-Breeding Prize",
    deck: "M",
    number: 73,
    category: "POINTS_PROVIDER",
    desc: [
        "During scoring, if you have at least 1 animal of each of the 4 types, you get 1 bonus point for each other player in the game. These points are doubled or tripled if you have 2 or 3 animals of each type, respectively."
    ],
    cost: {
        "sheep": 1
    },
    extraVp: true,
    prerequisite: "No Unused Farmyard Spaces",
    implemented: false,
    requiresFarmersOfTheMoor: true,
  },
})
