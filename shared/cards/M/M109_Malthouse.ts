import { defineMinorCard } from '../card-source'

const CARD_ID = 'M109_Malthouse'

export const M109_Malthouse = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Malthouse",
    deck: "M",
    number: 109,
    category: "FOOD_PROVIDER",
    desc: [
        "Each time you take the \"Cut Peat\" special action, you can also turn exactly 1 grain into 4 food."
    ],
    cost: {
        "clay": 2
    },
    vp: 1,
    implemented: false,
    requiresFarmersOfTheMoor: true,
  },
})
