import { MinorImprovement } from '../types'

const CARD_ID = 'A52_ThrowingAxe'

export const A52_ThrowingAxe = new MinorImprovement({
  id: CARD_ID,
  name: 'Throwing Axe',
  deck: 'A',
  number: 52,
  category: 'FOOD_PROVIDER',
  desc: ['Each time you use a wood accumulation space while there is at least 1 <PIG> on the __Pig Market__ accumulation space, you also get 2 <FOOD>.'],
  cost: { wood: 1 },
  prerequisite: 'Play in Round 7 or Later',
  newSet: true,
})
