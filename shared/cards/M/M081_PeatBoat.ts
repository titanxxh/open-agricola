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
    exchanges: [
        { from: { fuel: 3 }, to: { wood: 2 }, sourceId: CARD_ID, triggers: ['anytime'] },
        { from: { fuel: 3 }, to: { clay: 2 }, sourceId: CARD_ID, triggers: ['anytime'] },
        { from: { fuel: 4 }, to: { reed: 2 }, sourceId: CARD_ID, triggers: ['anytime'] },
        { from: { fuel: 4 }, to: { stone: 2 }, sourceId: CARD_ID, triggers: ['anytime'] },
        { from: { fuel: 2 }, to: { sheep: 1 }, sourceId: CARD_ID, triggers: ['anytime'] },
        { from: { fuel: 3 }, to: { food: 1 }, sourceId: CARD_ID, triggers: ['anytime'] },
      ],
    implemented: true,
    requiresFarmersOfTheMoor: true,
  },
})
