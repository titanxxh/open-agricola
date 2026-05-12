import { Occupation } from '../types'

const CARD_ID = 'C95_BasketWeaver'

export const C95_BasketWeaver = new Occupation({
  id: CARD_ID,
  name: 'Basket Weaver',
  deck: 'C',
  number: 95,
  category: 'ACTIONS_BOOSTER',
  desc: [
    "When you play this card, immediately build the __Basketmaker's Workshop__ major improvement for 1 <STONE> and 1 <REED>.",
  ],
  cost: {},
  players: '1+',
})
