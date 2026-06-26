import { defineMinorCard } from '../card-source'

const CARD_ID = 'M123_StoneQuarry'

export const M123_StoneQuarry = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Stone Quarry",
    deck: "M",
    number: 123,
    category: "BUILDING_RESOURCE_PROVIDER",
    desc: [
        "Place 5 stone--only 3 stone in 3-player games--on this card. Each time you take the \"Hiring Fair\" special action, you also get 1 stone from this card."
    ],
    cost: {
        "vegetable": 3
    },
    vp: 1,
    implemented: false,
    requiresFarmersOfTheMoor: true,
  },
})
