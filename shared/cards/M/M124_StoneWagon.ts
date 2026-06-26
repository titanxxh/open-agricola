import { defineMinorCard } from '../card-source'

const CARD_ID = 'M124_StoneWagon'

export const M124_StoneWagon = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Stone Wagon",
    deck: "M",
    number: 124,
    category: "BUILDING_RESOURCE_PROVIDER",
    desc: [
        "Each time you use the \"Day Laborer\" action space, you also get 1 stone."
    ],
    cost: {
        "wood": 2
    },
    implemented: false,
    requiresFarmersOfTheMoor: true,
  },
})
