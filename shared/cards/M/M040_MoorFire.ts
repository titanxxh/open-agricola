import { defineMinorCard } from '../card-source'

const CARD_ID = 'M040_MoorFire'

export const M040_MoorFire = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Moor Fire",
    deck: "M",
    number: 40,
    category: "FARM_PLANNER",
    desc: [
        "Once you only have 1 remaining moor, at any time, you can exchange it for 1 field tile."
    ],
    cost: {},
    prerequisite: "2 Moors",
    implemented: false,
    requiresFarmersOfTheMoor: true,
  },
})
