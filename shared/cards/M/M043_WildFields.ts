import { defineMinorCard } from '../card-source'

const CARD_ID = 'M043_WildFields'

export const M043_WildFields = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Wild Fields",
    deck: "M",
    number: 43,
    category: "FARM_PLANNER",
    desc: [
        "You can immediately place up to 2 field tiles, one at a time, on unused farmyard spaces that are not adjacent to existing fields. You can connect your fields later. All future fields must be adjacent to at least one existing field."
    ],
    cost: {
        "vegetable": 2
    },
    prerequisite: "2 Fields",
    implemented: false,
    requiresFarmersOfTheMoor: true,
  },
})
