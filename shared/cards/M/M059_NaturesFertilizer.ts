import { defineMinorCard } from '../card-source'

const CARD_ID = 'M059_NaturesFertilizer'

export const M059_NaturesFertilizer = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Nature's Fertilizer",
    deck: "M",
    number: 59,
    category: "ACTIONS_BOOSTER",
    desc: [
        "Each time after you take the \"Slash and Burn\" special action, you also get a \"Sow\" action for the new field only. This also applies when you exchange 1 moor for 1 field tile via a minor improvement."
    ],
    cost: {
        "vegetable": 2,
        "boar": 1
    },
    prerequisite: "1 Major Improvement",
    implemented: false,
    requiresFarmersOfTheMoor: true,
  },
})
