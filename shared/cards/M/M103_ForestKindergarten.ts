import { defineMinorCard } from '../card-source'

const CARD_ID = 'M103_ForestKindergarten'

export const M103_ForestKindergarten = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Forest Kindergarten",
    deck: "M",
    number: 103,
    category: "FOOD_PROVIDER",
    desc: [
        "Immediately after each time you take a \"Family Growth\" action with or without room, you get 1 food for each of your farmyard spaces containing at least 1 forest."
    ],
    cost: {
        "wood": 1,
        "stone": 2
    },
    vp: 1,
    prerequisite: "At Most 3 Forests",
    implemented: false,
    requiresFarmersOfTheMoor: true,
  },
})
