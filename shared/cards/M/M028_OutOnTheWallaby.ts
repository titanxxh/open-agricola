import { defineMinorCard } from '../card-source'

const CARD_ID = 'M028_OutOnTheWallaby'

export const M028_OutOnTheWallaby = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Out on the Wallaby",
    deck: "M",
    number: 28,
    category: "ACTIONS_BOOSTER",
    desc: [
        "You immediately get goods for each craft building that you have: 3 <WOOD> for the Joinery, 3 <CLAY> for the Pottery, 2 <REED> for the Basketmaker's Workshop."
    ],
    cost: {},
    passing: true,
    implemented: false,
    requiresFarmersOfTheMoor: true,
  },
})
