import { defineMinorCard } from '../card-source'

const CARD_ID = 'M087_PeatBarge'

export const M087_PeatBarge = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Peat Barge",
    deck: "M",
    number: 87,
    category: "GOODS_PROVIDER",
    desc: [
        "Each time you use the \"Fishing\" accumulation space, you also get 2 fuel."
    ],
    cost: {
        "wood": 2
    },
    vp: 1,
    implemented: false,
    requiresFarmersOfTheMoor: true,
  },
})
