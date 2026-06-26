import { defineMinorCard } from '../card-source'

const CARD_ID = 'M057_Taps'

export const M057_Taps = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Taps",
    deck: "M",
    number: 57,
    category: "ACTIONS_BOOSTER",
    desc: [
        "In each work phase, after you have placed all of your people, when it would be your turn again, you get exactly one more turn in which you can take a face-up special action card. The special action card costs 0 or 2 food, as usual."
    ],
    cost: {},
    prerequisite: "2 Improvements",
    implemented: false,
    requiresFarmersOfTheMoor: true,
  },
})
