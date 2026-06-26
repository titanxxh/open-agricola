import { defineMinorCard } from '../card-source'

const CARD_ID = 'M036_PeatMoss'

export const M036_PeatMoss = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Peat Moss",
    deck: "M",
    number: 36,
    category: "FARM_PLANNER",
    desc: [
        "Wooden rooms only cost you 3 <WOOD> and 1 <REED> each."
    ],
    cost: {},
    prerequisite: "No Moors",
    implemented: false,
    requiresFarmersOfTheMoor: true,
  },
})
