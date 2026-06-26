import { defineMinorCard } from '../card-source'

const CARD_ID = 'M090_WinterStorehouse'

export const M090_WinterStorehouse = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Winter Storehouse",
    deck: "M",
    number: 90,
    category: "GOODS_PROVIDER",
    desc: [
        "Place 3 usage counters on this card. At any time, you can return 1 usage counter from this card to get as much fuel and food until you have at least 2 fuel and 2 food."
    ],
    cost: {
        "wood": 1,
        "clay": 2
    },
    vp: 1,
    implemented: false,
    requiresFarmersOfTheMoor: true,
  },
})
