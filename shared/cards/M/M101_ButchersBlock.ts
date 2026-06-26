import { defineMinorCard } from '../card-source'

const CARD_ID = 'M101_ButchersBlock'

export const M101_ButchersBlock = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Butcher's Block",
    deck: "M",
    number: 101,
    category: "FOOD_PROVIDER",
    desc: [
        "You cannot play this card in rounds 4, 7, 9, 11, 13, and 14. All other players must and you can turn any 1 animal into food: <SHEEP> <ARROW> 1 <FOOD>, <PIG> <ARROW> 2 <FOOD>, <CATTLE> <ARROW> 3 <FOOD>, <HORSE> <ARROW> 2 <FOOD>."
    ],
    cost: {
        "wood": 1
    },
    vp: 1,
    prerequisite: "see below",
    implemented: false,
    requiresFarmersOfTheMoor: true,
  },
})
