import { defineMinorCard } from '../card-source'

const CARD_ID = 'M115_OakBark'

export const M115_OakBark = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Oak Bark",
    deck: "M",
    number: 115,
    category: "BUILDING_RESOURCE_PROVIDER",
    desc: [
        "When you play this card, you immediately get 2 wood. Each time you turn wild boar, cattle, or horses into food, you get 1 additional wood for each of these animals that you turn."
    ],
    cost: {
        "vegetable": 1
    },
    prerequisite: "2 Major Improvements",
    implemented: false,
    requiresFarmersOfTheMoor: true,
  },
})
