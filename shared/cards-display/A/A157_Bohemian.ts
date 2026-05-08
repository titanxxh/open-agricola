import { Occupation } from '../types'

const CARD_ID = 'A157_Bohemian'

export const A157_Bohemian = new Occupation({
  id: CARD_ID,
  name: 'Bohemian',
  deck: 'A',
  number: 157,
  category: 'FOOD_PROVIDER',
  desc: ['At the start of each returning home phase, if at least one __Lessons__ action space is unoccupied, you get 1 <FOOD>.'],
  cost: {},
  players: '4+',
  newSet: true,
})
