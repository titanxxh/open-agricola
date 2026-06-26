import { defineMinorCard } from '../card-source'

const CARD_ID = 'M037_BuildingPlan'

export const M037_BuildingPlan = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Building Plan",
    deck: "M",
    number: 37,
    category: "FARM_PLANNER",
    desc: [
        "Each time after you build at least 2 rooms at once, you can build up to 2 stables without paying wood."
    ],
    cost: {
        "food": 1
    },
    implemented: false,
    requiresFarmersOfTheMoor: true,
  },
})
