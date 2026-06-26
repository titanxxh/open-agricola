import { defineMinorCard } from '../card-source'

const CARD_ID = 'M069_LeatherSaddle'

export const M069_LeatherSaddle = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Leather Saddle",
    deck: "M",
    number: 69,
    category: "POINTS_PROVIDER",
    desc: [
        "Each time you have at least 3 horses, you get 1 bonus point for each cattle that you turn into food."
    ],
    cost: {
        "vegetable": 1
    },
    vp: 1,
    extraVp: true,
    prerequisite: "2 Horses",
    implemented: false,
    requiresFarmersOfTheMoor: true,
  },
})
