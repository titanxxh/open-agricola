import { defineMinorCard } from '../card-source'

const CARD_ID = 'M099_HealingClay'

export const M099_HealingClay = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Healing Clay",
    deck: "M",
    number: 99,
    category: "FOOD_PROVIDER",
    desc: [
        "When you play this card, you immediately get 1 food. Each time you use the \"Infirmary\" action space with a person lying in bed, you get 1 additional food."
    ],
    cost: {
        "clay": 1
    },
    vp: 1,
    implemented: false,
    requiresFarmersOfTheMoor: true,
  },
})
