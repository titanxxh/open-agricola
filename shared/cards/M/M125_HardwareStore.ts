import { defineMinorCard } from '../card-source'

const CARD_ID = 'M125_HardwareStore'

export const M125_HardwareStore = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Hardware Store",
    deck: "M",
    number: 125,
    category: "BUILDING_RESOURCE_PROVIDER",
    desc: [
        "Place 3 usage counters on this card. At any time, you can return 1 usage counter from this card to take 1 of each building resource that you have none of in your supply."
    ],
    cost: {
        "clay": 2,
        "reed": 1
    },
    prerequisite: "2 Improvements",
    implemented: false,
    requiresFarmersOfTheMoor: true,
  },
})
