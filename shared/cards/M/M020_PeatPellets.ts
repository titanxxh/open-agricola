import { defineMinorCard } from '../card-source'

const CARD_ID = 'M020_PeatPellets'

export const M020_PeatPellets = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Peat Pellets",
    deck: "M",
    number: 20,
    category: "GOODS_PROVIDER",
    desc: [
        "You immediately get 1 <FUEL> for each visible moor that you have."
    ],
    cost: {},
    prerequisite: "1 Major Improvement",
    passing: true,
    implemented: false,
    requiresFarmersOfTheMoor: true,
  },
})
