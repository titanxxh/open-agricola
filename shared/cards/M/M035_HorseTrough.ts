import { defineMinorCard } from '../card-source'

const CARD_ID = 'M035_HorseTrough'

export const M035_HorseTrough = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Horse Trough",
    deck: "M",
    number: 35,
    category: "FARM_PLANNER",
    desc: [
        "You can keep up to 2 horses in an unused farmyard space adjacent to your house. Even if you do, this farmyard space is still considered unused. You can change in which farmyard space you keep the horses."
    ],
    cost: {
        "stone": 1
    },
    implemented: false,
    requiresFarmersOfTheMoor: true,
  },
})
