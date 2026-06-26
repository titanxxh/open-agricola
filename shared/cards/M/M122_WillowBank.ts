import { defineMinorCard } from '../card-source'

const CARD_ID = 'M122_WillowBank'

export const M122_WillowBank = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Willow Bank",
    deck: "M",
    number: 122,
    category: "BUILDING_RESOURCE_PROVIDER",
    desc: [
        "Each time you take the \"Fell Trees\" special action, you also get 1 reed."
    ],
    cost: {},
    prerequisite: "1 Major Improvement",
    implemented: false,
    requiresFarmersOfTheMoor: true,
  },
})
