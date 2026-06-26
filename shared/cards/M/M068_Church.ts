import { defineMinorCard } from '../card-source'

const CARD_ID = 'M068_Church'

export const M068_Church = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Church",
    deck: "M",
    number: 68,
    category: "POINTS_PROVIDER",
    desc: [
        "Returning home phase: once, you can pay 1 <FUEL> to get 1 bonus point. When you build this upgrade, you immediately get 2 food. The Village Church starts under the Well."
    ],
    cost: {},
    vp: 5,
    extraVp: true,
    returnCards: [
        "Major_Moor_VillageChurch"
    ],
    implemented: false,
    requiresFarmersOfTheMoor: true,
  },
})
