import { defineMinorCard } from '../card-source'

const CARD_ID = 'M120_RiverClay'

export const M120_RiverClay = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "River Clay",
    deck: "M",
    number: 120,
    category: "BUILDING_RESOURCE_PROVIDER",
    desc: [
        "Each time you use the \"Fishing\" accumulation space, you also get 2 clay."
    ],
    cost: {},
    prerequisite: "1 Major Improvement",
    implemented: false,
    requiresFarmersOfTheMoor: true,
  },
})
