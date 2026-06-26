import { defineMinorCard } from '../card-source'

const CARD_ID = 'M039_SpecialPasture'

export const M039_SpecialPasture = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Special Pasture",
    deck: "M",
    number: 39,
    category: "FARM_PLANNER",
    desc: [
        "Immediately fence a farmyard space that is not adjacent to an existing pasture, without paying wood for the fences. You can connect your pastures later. All future pastures must be adjacent to at least one existing pasture."
    ],
    cost: {
        "wood": 2
    },
    prerequisite: "1 Pasture",
    implemented: false,
    requiresFarmersOfTheMoor: true,
  },
})
