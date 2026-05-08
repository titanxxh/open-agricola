import { Occupation } from '../types'

const CARD_ID = 'D96_Furnisher'

export const D96_Furnisher = new Occupation({
  id: CARD_ID,
  name: 'Furnisher',
  deck: 'D',
  number: 96,
  category: 'ACTIONS_BOOSTER',
  desc: [
    'When you play this card, you immediately get 2 <WOOD>. Each time after you build at least one new room, you can build or play a number of improvements equal to the number of new rooms you built, paying up to 1 <WOOD> less for each such improvement.',
  ],
  cost: {},
  players: '1+',
})
