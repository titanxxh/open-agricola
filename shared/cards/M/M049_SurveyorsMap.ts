import { defineMinorCard } from '../card-source'

const CARD_ID = 'M049_SurveyorsMap'

export const M049_SurveyorsMap = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Surveyor's Map",
    deck: "M",
    number: 49,
    category: "FARM_PLANNER",
    desc: [
        "Place a field tile on round space 11, a moor on round space 12, and a forest on round space 13. At the start of these rounds, you can place the respective tile on an unused farmyard space per the normal rules."
    ],
    cost: {
        "vegetable": 2
    },
    prerequisite: "Play in Round 2 or Before",
    maxRound: 2,
    implemented: false,
    requiresFarmersOfTheMoor: true,
  },
})
