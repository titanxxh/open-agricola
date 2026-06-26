import { defineMinorCard } from '../card-source'

const CARD_ID = 'M110_FarmCart'

export const M110_FarmCart = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Farm Cart",
    deck: "M",
    number: 110,
    category: "CROP_PROVIDER",
    desc: [
        "Each time you take at least 5 wood, 4 clay, 3 reed, or 2 stone from an accumulation space, you also get 1 grain."
    ],
    cost: {
        "wood": 3
    },
    prerequisite: "2 Horses",
    implemented: false,
    requiresFarmersOfTheMoor: true,
  },
})
