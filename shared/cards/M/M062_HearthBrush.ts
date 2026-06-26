import { defineMinorCard } from '../card-source'

const CARD_ID = 'M062_HearthBrush'

export const M062_HearthBrush = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Hearth Brush",
    deck: "M",
    number: 62,
    category: "POINTS_PROVIDER",
    desc: [
        "You can immediately move up the Tiled Oven. From the next round on, you can build it immediately after a person action by paying its cost. During scoring, it is worth 1 additional bonus point for you."
    ],
    cost: {
        "reed": 1
    },
    extraVp: true,
    implemented: false,
    requiresFarmersOfTheMoor: true,
  },
})
