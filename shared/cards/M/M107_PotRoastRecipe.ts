import { defineMinorCard } from '../card-source'

const CARD_ID = 'M107_PotRoastRecipe'

export const M107_PotRoastRecipe = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Pot Roast Recipe",
    deck: "M",
    number: 107,
    category: "FOOD_PROVIDER",
    desc: [
        "At any time, you can use your \"Fireplace\" and \"Cooking Hearth\" major improvements to turn 1 horse into 2 food."
    ],
    cost: {},
    prerequisite: "2 Horses",
    implemented: false,
    requiresFarmersOfTheMoor: true,
  },
})
