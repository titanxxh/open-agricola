import { defineMinorCard } from '../card-source'

const CARD_ID = 'M030_FarmAnimalMarket'

export const M030_FarmAnimalMarket = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Farm Animal Market",
    deck: "M",
    number: 30,
    category: "LIVESTOCK_PROVIDER",
    desc: [
        "You can immediately exchange exactly 2 <SHEEP> for 1 <CATTLE> and 1 <HORSE>. You may not exchange only 1 sheep."
    ],
    cost: {
        "food": 1
    },
    passing: true,
    implemented: false,
    requiresFarmersOfTheMoor: true,
  },
})
