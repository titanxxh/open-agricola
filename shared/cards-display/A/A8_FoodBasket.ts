import { MinorImprovement } from '../types'

const CARD_ID = 'A8_FoodBasket'

export const A8_FoodBasket = new MinorImprovement({
  id: CARD_ID,
  name: 'Food Basket',
  deck: 'A',
  number: 8,
  category: 'CROP_PROVIDER',
  desc: ['You immediately get 1 <GRAIN> and 1 <VEGETABLE>.'],
  cost: { reed: 1 },
  passing: true,
  prerequisite: '2 Occupations and 2 Improvements',
  occupationPrerequisites: { min: 2 },
  improvementPrerequisites: { min: 2 },
})
