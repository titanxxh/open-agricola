import { defineMinorCard } from '../card-source'

const CARD_ID = 'M130_Nosebag'

export const M130_Nosebag = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Nosebag",
    deck: "M",
    number: 130,
    category: "LIVESTOCK_PROVIDER",
    desc: [
        "Each time you use the \"Grain Seeds\" action space, you also get 1 horse."
    ],
    cost: {
        "vegetable": 1
    },
    prerequisite: "1 Major Improvement",
    implemented: false,
    requiresFarmersOfTheMoor: true,
  },
})
