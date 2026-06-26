import { defineMinorCard } from '../card-source'

const CARD_ID = 'M016_ClearFelling'

export const M016_ClearFelling = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Clear Felling",
    deck: "M",
    number: 16,
    category: "FARM_PLANNER",
    desc: [
        "You immediately get 2 <WOOD>. On each of up to 2 farmyard spaces containing nothing but exactly 1 forest, you can immediately turn that forest to the moor side."
    ],
    cost: {},
    prerequisite: "At Most 3 Forests",
    passing: true,
    implemented: false,
    requiresFarmersOfTheMoor: true,
  },
})
