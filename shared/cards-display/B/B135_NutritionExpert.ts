import { Occupation } from '../types'

const CARD_ID = 'B135_NutritionExpert'

export const B135_NutritionExpert = new Occupation({
  id: CARD_ID,
  name: 'Nutrition Expert',
  deck: 'B',
  number: 135,
  category: 'POINTS_PROVIDER',
  desc: ['At the start of each round, you can exchange a set comprised of 1 animal of any type, 1 <GRAIN>, and 1 <VEGETABLE> for 5 <FOOD> and 2 bonus <SCORE>.'],
  cost: {},
  players: '1+',
  newSet: true,
})
