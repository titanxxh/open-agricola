import { Occupation } from '../types'

const CARD_ID = 'E109_BraidMaker'

export const E109_BraidMaker = new Occupation({
  id: CARD_ID,
  name: 'Braid Maker',
  deck: 'E',
  number: 109,
  category: 'FOOD',
  desc: [
    "Each harvest, you can use this card to exchange 1 <REED> for 2 <FOOD>. You can build the  __Basketmaker's Workshop__ for 1 <REED> and 1 <STONE> even when taking a __Minor Improvement__ action. ",
  ],
  cost: {},
  players: '1+',
  exchanges: [
    { from: { reed: 1 }, to: { food: 2 }, max: 1, triggers: ['anytime'] },
  ],
})
