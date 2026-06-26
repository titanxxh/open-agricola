import { defineMinorCard } from '../card-source'

const CARD_ID = 'M026_ChimneyHood'

export const M026_ChimneyHood = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Chimney Hood",
    deck: "M",
    number: 26,
    category: "FOOD_PROVIDER",
    desc: [
        "You immediately get as much <FOOD> as you would get from one of your baking improvements if you baked 1 <GRAIN>."
    ],
    cost: {
        "clay": 1
    },
    passing: true,
    implemented: false,
    requiresFarmersOfTheMoor: true,
  },
})
