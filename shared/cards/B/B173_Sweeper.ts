import { Occupation } from '../types'

export const B173_Sweeper = new Occupation({
  id: 'B173_Sweeper',
  name: 'Sweeper',
  deck: 'B',
  number: 173,
  category: 'FOOD_PROVIDER',
  desc: ['Each time you use an action space with the (meeple) symbol, place 1 food on this card. Once this game, you can turn this card face down to get the food on it.'],
  cost: {},
  players: '5+',
})
