import { defineMinorCard } from '../card-source'

const CARD_ID = 'M108_GrainDistillery'

export const M108_GrainDistillery = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Grain Distillery",
    deck: "M",
    number: 108,
    category: "FOOD_PROVIDER",
    desc: [
        "Harvest: once, you can turn 1 <FUEL> and 1 <GRAIN> into 5 <FOOD>. Any number of times during scoring: 1 <FUEL> and 1 <GRAIN> <ARROW> 1 bonus point."
    ],
    cost: {
        "stone": 2,
        "sheep": 1
    },
    vp: 1,
    extraVp: true,
    implemented: false,
    requiresFarmersOfTheMoor: true,
  },
})
