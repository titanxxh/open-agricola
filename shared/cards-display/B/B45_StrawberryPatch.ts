import { MinorImprovement } from '../types'

const CARD_ID = 'B45_StrawberryPatch'

export const B45_StrawberryPatch = new MinorImprovement({
  id: CARD_ID,
  name: 'Strawberry Patch',
  deck: 'B',
  number: 45,
  category: 'FOOD_PROVIDER',
  desc: ['Place 1 <FOOD> on each of the next 3 round spaces. At the start of these rounds, you get the <FOOD>.'],
  cost: { wood: 1 },
  vp: 2,
  prerequisite: '2 Vegetable Fields',
})
