import { Occupation } from '../types'

const CARD_ID = 'B111_Rustic'

export const B111_Rustic = new Occupation({
  id: CARD_ID,
  name: 'Rustic',
  deck: 'B',
  number: 111,
  category: 'FOOD_PROVIDER',
  desc: ['For each clay room you build, you get 2 <FOOD> and 1 bonus <SCORE>. (this does not apply to stone rooms and renovated wood rooms.)'],
  cost: {},
  players: '1+',
  extraVp: true,
})
