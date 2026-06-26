import { defineMinorCard } from '../card-source'

const CARD_ID = 'M023_EdgeOfTheForest'

export const M023_EdgeOfTheForest = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Edge of the Forest",
    deck: "M",
    number: 23,
    category: "GOODS_PROVIDER",
    desc: [
        "You immediately get 1 <FOOD> for each of your fence spaces between a forest and a field, and 1 <FUEL> for each of your fence spaces between a forest and a moor."
    ],
    cost: {},
    prerequisite: "3 Improvements",
    passing: true,
    implemented: false,
    requiresFarmersOfTheMoor: true,
  },
})
