import { Occupation } from '../types'

const CARD_ID = 'A140_ShovelBearer'

export const A140_ShovelBearer = new Occupation({
  id: CARD_ID,
  name: 'Shovel Bearer',
  deck: 'A',
  number: 140,
  category: 'FOOD_PROVIDER',
  desc: ['Each time you use the __Clay Pit__ or __Hollow__ accumulation space, you also get a number of <FOOD> equal to the amount of <CLAY> on the respective other accumulation space.'],
  cost: {},
  players: '3+',
})
