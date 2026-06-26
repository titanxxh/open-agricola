import { defineMinorCard } from '../card-source'

const CARD_ID = 'M114_RiversideWoods'

export const M114_RiversideWoods = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Riverside Woods",
    deck: "M",
    number: 114,
    category: "BUILDING_RESOURCE_PROVIDER",
    desc: [
        "With this card, each time you use the \"Fishing\" accumulation space, you also get 1 wood for each of your farmyard spaces containing at least 1 forest, up to a maximum of 3 wood."
    ],
    cost: {},
    prerequisite: "3 Major Improvements",
    implemented: false,
    requiresFarmersOfTheMoor: true,
  },
})
