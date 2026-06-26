import { defineMinorCard } from '../card-source'

const CARD_ID = 'M083_CoalSeam'

export const M083_CoalSeam = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Coal Seam",
    deck: "M",
    number: 83,
    category: "ACTIONS_BOOSTER",
    desc: [
        "When you play this card, you immediately get 1 fuel. Each time you take the \"Hiring Fair\" special action or use the \"Day Laborer\" action space, you also get 1 fuel."
    ],
    cost: {
        "wood": 1,
        "clay": 1
    },
    vp: 1,
    implemented: false,
    requiresFarmersOfTheMoor: true,
  },
})
