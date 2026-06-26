import { defineMinorCard } from '../card-source'

const CARD_ID = 'M098_FishSmokehouse'

export const M098_FishSmokehouse = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Fish Smoke-house",
    deck: "M",
    number: 98,
    category: "FOOD_PROVIDER",
    desc: [
        "Each time you use the \"Fishing\" accumulation space, you can pay 1 fuel to get an additional 3 food."
    ],
    cost: {
        "wood": 1,
        "clay": 2
    },
    vp: 2,
    implemented: false,
    requiresFarmersOfTheMoor: true,
  },
})
