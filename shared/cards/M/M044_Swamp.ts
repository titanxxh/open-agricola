import { defineMinorCard } from '../card-source'

const CARD_ID = 'M044_Swamp'

export const M044_Swamp = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Swamp",
    deck: "M",
    number: 44,
    category: "FARM_PLANNER",
    desc: [
        "Place 1 moor on round space 12. At the start of that round, you can place the moor on an unused farmyard space."
    ],
    cost: {},
    prerequisite: "Play in Round 4 or Before",
    maxRound: 4,
    implemented: false,
    requiresFarmersOfTheMoor: true,
  },
})
