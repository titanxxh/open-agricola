import { Occupation } from '../types'

const CARD_ID = 'C111_SmallAnimalBreeder'

export const C111_SmallAnimalBreeder = new Occupation({
  id: CARD_ID,
  name: 'Small Animal Breeder',
  deck: 'C',
  number: 111,
  category: 'FOOD_PROVIDER',
  desc: ['Before the start of each round, if you have <FOOD> equal to or higher than the upcoming round number (e.g., 8+ <FOOD> before round 8), you get 1 <FOOD>.'],
  cost: {},
  players: '1+',
  newSet: true,
})
