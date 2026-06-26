import { defineMinorCard } from '../card-source'

const CARD_ID = 'M065_FireBrigade'

export const M065_FireBrigade = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Fire Brigade",
    deck: "M",
    number: 65,
    category: "POINTS_PROVIDER",
    desc: [
        "When you play this card, you immediately get 2 food. Additionally, if there are forests on at least 2/3/4/5 of your farmyard spaces, you immediately get 1/2/3/4 bonus points. Crops and wood do not count but you can exchange them."
    ],
    cost: {
        "clay": 1,
        "stone": 1
    },
    extraVp: true,
    prerequisite: "4 Food and 4 Fuel",
    implemented: false,
    requiresFarmersOfTheMoor: true,
  },
})
