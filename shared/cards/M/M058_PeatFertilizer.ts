import { defineMinorCard } from '../card-source'

const CARD_ID = 'M058_PeatFertilizer'

export const M058_PeatFertilizer = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Peat Fertilizer",
    deck: "M",
    number: 58,
    category: "ACTIONS_BOOSTER",
    desc: [
        "Each time after you take the \"Cut Peat\" special action, you can also take a \"Sow\" action."
    ],
    cost: {},
    prerequisite: "2 Fields",
    implemented: false,
    requiresFarmersOfTheMoor: true,
  },
})
