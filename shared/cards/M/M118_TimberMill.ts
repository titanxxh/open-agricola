import { defineMinorCard } from '../card-source'

const CARD_ID = 'M118_TimberMill'

export const M118_TimberMill = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Timber Mill",
    deck: "M",
    number: 118,
    category: "BUILDING_RESOURCE_PROVIDER",
    desc: [
        "Each time you take the \"Fell Trees\" special action or take at least 4 wood from an accumulation space, you get 1 additional wood. If you pay 1 fuel, you get 2 additional wood instead of 1."
    ],
    cost: {
        "clay": 3,
        "stone": 2
    },
    vp: 3,
    implemented: false,
    requiresFarmersOfTheMoor: true,
  },
})
