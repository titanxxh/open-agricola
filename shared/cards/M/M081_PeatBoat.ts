import { defineMinorCard } from '../card-source'

const CARD_ID = 'M081_PeatBoat'

export const M081_PeatBoat = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Peat Boat",
    deck: "M",
    number: 81,
    category: "GOODS_PROVIDER",
    desc: [
        "At any time: 3 <FUEL> <ARROW> 2 <WOOD> or 2 <CLAY>; 4 <FUEL> <ARROW> 2 <REED> or 2 <STONE>; 2 <FUEL> <ARROW> 1 <SHEEP>; 3 <FUEL> <ARROW> 1 <FOOD>. You cannot get only one of a building resource from this."
    ],
    cost: {
        "wood": 3,
        "reed": 2
    },
    vp: 3,
    implemented: false,
    requiresFarmersOfTheMoor: true,
  },
})
