import { defineMinorCard } from '../card-source'

const CARD_ID = 'M131_CattleStall'

export const M131_CattleStall = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Cattle Stall",
    deck: "M",
    number: 131,
    category: "LIVESTOCK_PROVIDER",
    desc: [
        "Add 2, 4, 6, and 8 to the current round and place 1 animal of your choice on each corresponding round space. All the animals must be different. At the start of these rounds, you can buy the respective animal for 1 food."
    ],
    cost: {
        "wood": 2,
        "clay": 2
    },
    vp: 1,
    implemented: false,
    requiresFarmersOfTheMoor: true,
  },
})
