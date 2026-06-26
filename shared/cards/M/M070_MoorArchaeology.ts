import { defineMinorCard } from '../card-source'

const CARD_ID = 'M070_MoorArchaeology'

export const M070_MoorArchaeology = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Moor Archaeology",
    deck: "M",
    number: 70,
    category: "POINTS_PROVIDER",
    desc: [
        "Each time you take the \"Cut Peat\" special action, you can place 1 fence from your supply on the emptied farmyard space. That space counts as used but it is blocked for the rest of the game. During scoring, it is worth 1 additional bonus point."
    ],
    cost: {},
    vp: 1,
    extraVp: true,
    prerequisite: "Clay House",
    implemented: false,
    requiresFarmersOfTheMoor: true,
  },
})
