import { defineMinorCard } from '../card-source'

const CARD_ID = 'M106_HorseButchery'

export const M106_HorseButchery = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Horse Butchery",
    deck: "M",
    number: 106,
    category: "FOOD_PROVIDER",
    desc: [
        "At any time: <SHEEP> <ARROW> 1 <FOOD>; <PIG> <ARROW> 2 <FOOD>; <CATTLE> <ARROW> 3 <FOOD>; <HORSE> <ARROW> 2 <FOOD>; 2 <HORSE> <ARROW> 5 <FOOD>. The Horse Slaughterhouses start under the Fireplaces."
    ],
    cost: {},
    vp: 3,
    returnCards: [
        "Major_Moor_HorseSlaughterhouse1",
        "Major_Moor_HorseSlaughterhouse2"
    ],
    implemented: false,
    requiresFarmersOfTheMoor: true,
  },
})
