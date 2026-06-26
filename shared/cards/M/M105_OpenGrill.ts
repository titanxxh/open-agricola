import { defineMinorCard } from '../card-source'

const CARD_ID = 'M105_OpenGrill'

export const M105_OpenGrill = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Open Grill",
    deck: "M",
    number: 105,
    category: "FOOD_PROVIDER",
    desc: [
        "At any time: <VEGETABLE> <ARROW> 2 <FOOD>; <SHEEP> <ARROW> 2 <FOOD>; <PIG> <ARROW> 3 <FOOD>; <CATTLE> <ARROW> 3 <FOOD>; <HORSE> <ARROW> 2 <FOOD>. \"Bake Bread\" action: <GRAIN> <ARROW> 2 <FOOD>."
    ],
    cost: {},
    vp: 2,
    returnCards: [
        "Major_Fireplace1",
        "Major_Fireplace2",
        "Major_Fireplace3"
    ],
    implemented: false,
    requiresFarmersOfTheMoor: true,
  },
})
