import { defineMinorCard } from '../card-source'

const CARD_ID = 'M072_OvenDamper'

export const M072_OvenDamper = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Oven Damper",
    deck: "M",
    number: 72,
    category: "POINTS_PROVIDER",
    desc: [
        "When you play this card, you immediately get 3 fuel. During scoring, you get 1 additional bonus point each for the \"Clay Oven\", \"Stone Oven\", \"Heating Oven\", and \"Tiled Oven\" major improvements and the \"Oven Installation\" upgrade."
    ],
    cost: {
        "stone": 2
    },
    vp: 1,
    extraVp: true,
    implemented: false,
    requiresFarmersOfTheMoor: true,
  },
})
