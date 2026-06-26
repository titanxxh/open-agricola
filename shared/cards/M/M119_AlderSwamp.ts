import { defineMinorCard } from '../card-source'

const CARD_ID = 'M119_AlderSwamp'

export const M119_AlderSwamp = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Alder Swamp",
    deck: "M",
    number: 119,
    category: "BUILDING_RESOURCE_PROVIDER",
    desc: [
        "Each time you take the \"Fell Trees\" special action, you also get your choice of 1 wood or 1 reed."
    ],
    cost: {
        "vegetable": 2
    },
    vp: 1,
    prerequisite: "2 Improvements",
    implemented: false,
    requiresFarmersOfTheMoor: true,
  },
})
