import { defineMinorCard } from '../card-source'

const CARD_ID = 'M079_PeatSled'

export const M079_PeatSled = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Peat Sled",
    deck: "M",
    number: 79,
    category: "GOODS_PROVIDER",
    desc: [
        "Add your choice of 2/4/7/10 to the current round and place 3/4/5/6 fuel on the corresponding round space. At the start of that round, you get the fuel."
    ],
    cost: {
        "wood": 1
    },
    implemented: false,
    requiresFarmersOfTheMoor: true,
  },
})
