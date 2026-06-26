import { defineMinorCard } from '../card-source'

const CARD_ID = 'M097_VillageHall'

export const M097_VillageHall = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Village Hall",
    deck: "M",
    number: 97,
    category: "FOOD_PROVIDER",
    desc: [
        "At the start of each returning home phase in which there is no special action card in front of you, you get 2 food."
    ],
    cost: {
        "wood": 2,
        "clay": 2
    },
    vp: 1,
    implemented: false,
    requiresFarmersOfTheMoor: true,
  },
})
