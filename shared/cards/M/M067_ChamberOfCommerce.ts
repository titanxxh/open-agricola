import { defineMinorCard } from '../card-source'

const CARD_ID = 'M067_ChamberOfCommerce'

export const M067_ChamberOfCommerce = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Chamber of Commerce",
    deck: "M",
    number: 67,
    category: "POINTS_PROVIDER",
    desc: [
        "When you play this card, you immediately get 1 wood and 1 reed. During scoring, you get 1 additional bonus point for each of the \"Joinery\", \"Pottery\", and \"Basketmaker's Workshop\" major improvements that you have."
    ],
    cost: {
        "clay": 2,
        "stone": 1
    },
    vp: 1,
    extraVp: true,
    implemented: false,
    requiresFarmersOfTheMoor: true,
  },
})
