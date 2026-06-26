import { defineMinorCard } from '../card-source'

const CARD_ID = 'M126_CooperativeStore'

export const M126_CooperativeStore = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Cooperative Store",
    deck: "M",
    number: 126,
    category: "BUILDING_RESOURCE_PROVIDER",
    desc: [
        "Place 4 usage counters on this card. At any time, you can return 1 usage counter from this card plus 1 building resource of your choice to get 1 of any other building resource except stone."
    ],
    cost: {
        "wood": 2,
        "clay": 1
    },
    vp: 1,
    implemented: false,
    requiresFarmersOfTheMoor: true,
  },
})
