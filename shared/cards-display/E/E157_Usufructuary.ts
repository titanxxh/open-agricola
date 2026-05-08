import { Occupation } from '../types'

const CARD_ID = 'E157_Usufructuary'

export const E157_Usufructuary = new Occupation({
  id: CARD_ID,
  name: 'Usufructuary',
  deck: 'E',
  number: 157,
  category: 'FOOD',
  desc: [
    'When you play this card as your first occupation, you immediately get 1 <FOOD> for every other occupation in play (by any player), up to a maximum of 7 <FOOD>.',
  ],
  cost: {},
  players: '4+',
})
