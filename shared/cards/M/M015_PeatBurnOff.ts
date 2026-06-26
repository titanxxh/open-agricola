import { defineMinorCard } from '../card-source'

const CARD_ID = 'M015_PeatBurnOff'

export const M015_PeatBurnOff = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Peat Burn-off",
    deck: "M",
    number: 15,
    category: "FARM_PLANNER",
    desc: [
        "You immediately get 1 <FUEL>. Additionally, you can immediately exchange 1 moor for 1 field tile."
    ],
    cost: {},
    passing: true,
    implemented: false,
    requiresFarmersOfTheMoor: true,
  },
})
