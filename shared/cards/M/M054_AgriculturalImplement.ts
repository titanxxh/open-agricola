import { defineMinorCard } from '../card-source'

const CARD_ID = 'M054_AgriculturalImplement'

export const M054_AgriculturalImplement = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Agricultural Implement",
    deck: "M",
    number: 54,
    category: "ACTIONS_BOOSTER",
    desc: [
        "Immediately after each time you use the \"Farmland\" or \"Cultivation\" action space, you can take a face-up special action card. The special action card costs 0 or 2 food, as usual."
    ],
    cost: {
        "wood": 1
    },
    implemented: false,
    requiresFarmersOfTheMoor: true,
  },
})
