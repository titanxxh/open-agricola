import { defineMinorCard } from '../card-source'

const CARD_ID = 'M052_WeddingCoach'

export const M052_WeddingCoach = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Wedding Coach",
    deck: "M",
    number: 52,
    category: "ACTIONS_BOOSTER",
    desc: [
        "When you play this card, you can immediately take a \"Family Growth without Room\" action without placing a person. Place the newborn on this card until the returning home phase."
    ],
    cost: {
        "wood": 2,
        "food": 1
    },
    prerequisite: "4 Horses",
    implemented: false,
    requiresFarmersOfTheMoor: true,
  },
})
