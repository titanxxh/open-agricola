import { defineMinorCard } from '../card-source'

const CARD_ID = 'M089_BirthingHouse'

export const M089_BirthingHouse = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Birthing House",
    deck: "M",
    number: 89,
    category: "GOODS_PROVIDER",
    desc: [
        "Immediately after each time you take a \"Family Growth\" action with or without room, you get 1 fuel, 1 food, and 1 bonus point."
    ],
    cost: {
        "clay": 2,
        "stone": 1
    },
    vp: 2,
    extraVp: true,
    implemented: false,
    requiresFarmersOfTheMoor: true,
  },
})
