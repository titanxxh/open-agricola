import { defineMinorCard } from '../card-source'

const CARD_ID = 'M032_PeatHut'

export const M032_PeatHut = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Peat Hut",
    deck: "M",
    number: 32,
    category: "FARM_PLANNER",
    desc: [
        "This card provides room for one person. In the feeding phase of each harvest, it must be heated with 1 <FUEL>. Instead of a \"Renovation\" action, you can remove this card from play and add 1 wooden room to your wood house at no cost."
    ],
    cost: {
        "fuel": 5,
        "reed": 2
    },
    vp: 1,
    implemented: false,
    requiresFarmersOfTheMoor: true,
  },
})
