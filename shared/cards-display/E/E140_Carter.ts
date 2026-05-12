import { Occupation } from '../types'

const CARD_ID = 'E140_Carter'

export const E140_Carter = new Occupation({
  id: CARD_ID,
  name: 'Carter',
  deck: 'E',
  number: 140,
  desc: ['Next round, each time you use a building resource accumulation space, you also get 1 <FOOD> for each building resource that you take from the space.'],
  cost: {},
  players: '3+',
  category: 'FOOD',
})
