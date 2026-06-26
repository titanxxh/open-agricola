import { defineMinorCard } from '../card-source'

const CARD_ID = 'M063_PastoralLetter'

export const M063_PastoralLetter = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Pastoral Letter",
    deck: "M",
    number: 63,
    category: "POINTS_PROVIDER",
    desc: [
        "You can immediately move up the Village Church. From the next round on, you can build it immediately after a person action by paying its cost. During scoring, the Church and Village Church are each worth 1 additional bonus point for you."
    ],
    cost: {},
    extraVp: true,
    prerequisite: "2 Major Improvements",
    implemented: false,
    requiresFarmersOfTheMoor: true,
  },
})
