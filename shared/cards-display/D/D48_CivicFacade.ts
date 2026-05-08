import { MinorImprovement } from '../types'

const CARD_ID = 'D48_CivicFacade'

export const D48_CivicFacade = new MinorImprovement({
  id: CARD_ID,
  name: 'Civic Facade',
  deck: 'D',
  number: 48,
  category: 'FOOD_PROVIDER',
  desc: ['Before the start of each round, if you have more occupations than improvements in your hand, you get 1 <FOOD>.'],
  cost: { clay: 1 },
  prerequisite: '3 Rooms',
  newSet: true,
})
