import { MinorImprovement } from '../types'

const CARD_ID = 'A46_ClawKnife'

export const A46_ClawKnife = new MinorImprovement({
  id: CARD_ID,
  name: 'Claw Knife',
  deck: 'A',
  number: 46,
  category: 'FOOD_PROVIDER',
  desc: ['Each time you use the __Sheep Market__ accumulation space, place 1 <FOOD> on each of the next 2 round spaces. At the start of these rounds, you get the <FOOD>.'],
  cost: { wood: 1 },
  vp: 1,
  prerequisite: 'Exactly 1 Pasture',
})
