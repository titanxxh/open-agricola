import { Occupation } from '../types'

export const A177_Middleman = new Occupation({
  id: 'A177_Middleman',
  name: 'Middleman',
  deck: 'A',
  number: 177,
  category: 'BUILDING_RESOURCE_PROVIDER',
  desc: ['Place 1 stone and 1 food on all action spaces with the meeple symbol on the game board extension. Next time you place a person on them, you get the goods.'],
  cost: {},
  players: '5+',
})
