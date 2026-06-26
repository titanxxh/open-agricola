import { defineMinorCard } from '../card-source'

const CARD_ID = 'M019_LawnTurf'

export const M019_LawnTurf = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Lawn Turf",
    deck: "M",
    number: 19,
    category: "GOODS_PROVIDER",
    desc: [
        "If you have exactly 3/4/5/6/7 unused farmyard spaces, you immediately get 1/2/3/4/5 <FUEL>."
    ],
    cost: {},
    prerequisite: "4 Improvements",
    passing: true,
    implemented: false,
    requiresFarmersOfTheMoor: true,
  },
})
