import { defineMinorCard } from '../card-source'

const CARD_ID = 'M129_PlowhorseMarket'

export const M129_PlowhorseMarket = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Plowhorse Market",
    deck: "M",
    number: 129,
    category: "LIVESTOCK_PROVIDER",
    desc: [
        "Each time you use the \"Farmland\" or \"Cultivation\" action space, you can also buy exactly 1 horse for 1 food."
    ],
    cost: {
        "clay": 1
    },
    vp: 1,
    prerequisite: "1 Major Improvement",
    implemented: false,
    requiresFarmersOfTheMoor: true,
  },
})
