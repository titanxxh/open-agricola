import { defineMinorCard } from '../card-source'

const CARD_ID = 'M128_Workbench'

export const M128_Workbench = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Workbench",
    deck: "M",
    number: 128,
    category: "BUILDING_RESOURCE_PROVIDER",
    desc: [
        "In the field phase of each harvest at the end of rounds 13 and 14, you get 3 wood, 2 clay, and 1 reed. You can use these, for example, to earn bonus points from the Joinery, Pottery, or Basketmaker's Workshop."
    ],
    cost: {
        "wood": 2
    },
    prerequisite: "At Most 4 Improvements",
    implemented: false,
    requiresFarmersOfTheMoor: true,
  },
})
