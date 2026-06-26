import { defineMinorCard } from '../card-source'

const CARD_ID = 'M078_Barge'

export const M078_Barge = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Barge",
    deck: "M",
    number: 78,
    category: "GOODS_PROVIDER",
    desc: [
        "Alternate placing 1 fuel and 1 food on each remaining round space, starting with fuel. At the start of these rounds, you get the respective good."
    ],
    cost: {
        "wood": 3
    },
    vp: 1,
    prerequisite: "2 Improvements",
    implemented: false,
    requiresFarmersOfTheMoor: true,
  },
})
