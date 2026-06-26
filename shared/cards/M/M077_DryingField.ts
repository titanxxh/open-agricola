import { defineMinorCard } from '../card-source'

const CARD_ID = 'M077_DryingField'

export const M077_DryingField = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Drying Field",
    deck: "M",
    number: 77,
    category: "GOODS_PROVIDER",
    desc: [
        "Each time you take the \"Cut Peat\" special action, add 3 to the current round and place 2 fuel on the corresponding round space. At the start of that round, you get the fuel."
    ],
    cost: {
        "vegetable": 2
    },
    vp: 1,
    implemented: false,
    requiresFarmersOfTheMoor: true,
  },
})
