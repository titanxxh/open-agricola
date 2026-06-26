import { defineMinorCard } from '../card-source'

const CARD_ID = 'M100_Pheromones'

export const M100_Pheromones = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Pheromones",
    deck: "M",
    number: 100,
    category: "FOOD_PROVIDER",
    desc: [
        "When you play this card, you immediately get 1 food. Additionally, each player, including you, with at least 1 stable or pasture immediately gets 2 food."
    ],
    cost: {},
    prerequisite: "At Most 2 Improvements",
    implemented: false,
    requiresFarmersOfTheMoor: true,
  },
})
