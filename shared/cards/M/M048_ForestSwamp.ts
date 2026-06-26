import { defineMinorCard } from '../card-source'

const CARD_ID = 'M048_ForestSwamp'

export const M048_ForestSwamp = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Forest Swamp",
    deck: "M",
    number: 48,
    category: "ACTIONS_BOOSTER",
    desc: [
        "Each time you take the \"Cut Peat\" special action, add 4 to the current round and place 1 forest on the corresponding round space. At the start of that round, you can place the forest on an unused farmyard space."
    ],
    cost: {},
    prerequisite: "2 Major Improvements",
    implemented: false,
    requiresFarmersOfTheMoor: true,
  },
})
