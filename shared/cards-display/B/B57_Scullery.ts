import { MinorImprovement } from '../types'

const CARD_ID = 'B57_Scullery'

export const B57_Scullery = new MinorImprovement({
  id: CARD_ID,
  name: 'Scullery',
  deck: 'B',
  number: 57,
  category: 'FOOD_PROVIDER',
  desc: ['At the start of each round, if you live in a wooden house, you get 1 <FOOD>.'],
  cost: { wood: 1, clay: 1 },
})
