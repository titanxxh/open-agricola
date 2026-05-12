import { Occupation } from '../types'

const CARD_ID = 'B110_Pavior'

export const B110_Pavior = new Occupation({
  id: CARD_ID,
  name: 'Pavior',
  deck: 'B',
  number: 110,
  category: 'FOOD_PROVIDER',
  desc: [
    'At the end of each preparation phase, if you have at least 1 <STONE> in your supply, you get 1 <FOOD>. In round 14, you get 1 <VEGETABLE> instead.',
  ],
  cost: {},
  players: '1+',
})
