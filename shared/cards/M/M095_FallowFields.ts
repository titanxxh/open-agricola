import { defineMinorCard } from '../card-source'

const CARD_ID = 'M095_FallowFields'

export const M095_FallowFields = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Fallow Fields",
    deck: "M",
    number: 95,
    category: "FOOD_PROVIDER",
    desc: [
        "Place 2 food on each of up to 3 of your empty fields. You cannot harvest the food. You get it when you sow in these fields."
    ],
    cost: {},
    implemented: false,
    requiresFarmersOfTheMoor: true,
  },
})
