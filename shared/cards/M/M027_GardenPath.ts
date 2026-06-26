import { defineMinorCard } from '../card-source'

const CARD_ID = 'M027_GardenPath'

export const M027_GardenPath = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Garden Path",
    deck: "M",
    number: 27,
    category: "ACTIONS_BOOSTER",
    desc: [
        "You immediately get 3 <WOOD>. The player to your left must immediately place the \"Garden Path\" token in front of them."
    ],
    cost: {
        "clay": 1
    },
    prerequisite: "At Least 1 Forest",
    passing: true,
    implemented: false,
    requiresFarmersOfTheMoor: true,
  },
})
