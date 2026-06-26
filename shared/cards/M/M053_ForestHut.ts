import { defineMinorCard } from '../card-source'

const CARD_ID = 'M053_ForestHut'

export const M053_ForestHut = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Forest Hut",
    deck: "M",
    number: 53,
    category: "ACTIONS_BOOSTER",
    desc: [
        "Place 1 person from your supply on a forest. Once you remove the forest, you can place the person that round. In the returning home phase of that round, return the person to your supply. Until then, you cannot use it for family growth."
    ],
    cost: {
        "wood": 2
    },
    vp: 1,
    implemented: false,
    requiresFarmersOfTheMoor: true,
  },
})
