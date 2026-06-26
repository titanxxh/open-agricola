import { defineMinorCard } from '../card-source'

const CARD_ID = 'M064_FamilyBurialPlot'

export const M064_FamilyBurialPlot = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Family Burial Plot",
    deck: "M",
    number: 64,
    category: "POINTS_PROVIDER",
    desc: [
        "When you play this card, you can immediately place the \"Tombstone\" token on an unused farmyard space. That space counts as used but it is blocked for the rest of the game. During scoring, it is worth 1 additional bonus point."
    ],
    cost: {
        "stone": 1
    },
    vp: 1,
    extraVp: true,
    prerequisite: "Stone House",
    implemented: false,
    requiresFarmersOfTheMoor: true,
  },
})
