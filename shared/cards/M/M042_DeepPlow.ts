import { defineMinorCard } from '../card-source'

const CARD_ID = 'M042_DeepPlow'

export const M042_DeepPlow = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Deep Plow",
    deck: "M",
    number: 42,
    category: "FARM_PLANNER",
    desc: [
        "You can immediately place 1 moor on an unused farmyard space. Each time you use the \"Farmland\" or \"Cultivation\" action space, you can also exchange 1 moor for 1 field tile."
    ],
    cost: {
        "wood": 3
    },
    vp: 2,
    prerequisite: "2 Improvements",
    implemented: false,
    requiresFarmersOfTheMoor: true,
  },
})
