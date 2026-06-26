import { defineMinorCard } from '../card-source'

const CARD_ID = 'M061_HayWagon'

export const M061_HayWagon = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Hay Wagon",
    deck: "M",
    number: 61,
    category: "ACTIONS_BOOSTER",
    desc: [
        "Each time after you take at least 3 wood, 3 clay, 2 reed, or 2 stone from an accumulation space, you can take a \"Build Rooms\" or \"Renovation\" action without placing a person."
    ],
    cost: {
        "wood": 2
    },
    vp: 1,
    prerequisite: "2 Horses",
    implemented: false,
    requiresFarmersOfTheMoor: true,
  },
})
