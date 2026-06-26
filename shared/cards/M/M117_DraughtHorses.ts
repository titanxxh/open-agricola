import { defineMinorCard } from '../card-source'

const CARD_ID = 'M117_DraughtHorses'

export const M117_DraughtHorses = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Draught-horses",
    deck: "M",
    number: 117,
    category: "BUILDING_RESOURCE_PROVIDER",
    desc: [
        "Each time you take exactly 3 or at least 4 wood from an accumulation space, if you have at least 1 horse, you can pay exactly 1 food to get 1 or 2 additional wood, respectively."
    ],
    cost: {},
    implemented: false,
    requiresFarmersOfTheMoor: true,
  },
})
