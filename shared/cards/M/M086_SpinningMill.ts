import { defineMinorCard } from '../card-source'

const CARD_ID = 'M086_SpinningMill'

export const M086_SpinningMill = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Spinning Mill",
    deck: "M",
    number: 86,
    category: "GOODS_PROVIDER",
    desc: [
        "For every 2 sheep that you have in the field phase of each harvest, you pay 1 fuel less to heat your house in the feeding phase of that harvest, but not less than 0 fuel."
    ],
    cost: {
        "wood": 2,
        "clay": 2
    },
    vp: 2,
    prerequisite: "1 Sheep",
    implemented: false,
    requiresFarmersOfTheMoor: true,
  },
})
