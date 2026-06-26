import { defineMinorCard } from '../card-source'

const CARD_ID = 'M074_Administration'

export const M074_Administration = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Administration",
    deck: "M",
    number: 74,
    category: "POINTS_PROVIDER",
    desc: [
        "When you play this card, you immediately get 2 food. In the harvest at the end of round 14, for each major improvement you have, you can exchange 1 food for 1 bonus point. This card counts as an improvement in hand for its prerequisite."
    ],
    cost: {
        "wood": 1,
        "clay": 2
    },
    extraVp: true,
    prerequisite: "At Most 4 Improvements in Hand",
    implemented: false,
    requiresFarmersOfTheMoor: true,
  },
})
