import { MinorImprovement } from '../types'

const CARD_ID = 'B24_Lasso'

export const B24_Lasso = new MinorImprovement({
  id: CARD_ID,
  name: 'Lasso',
  deck: 'B',
  number: 24,
  category: 'ACTIONS_BOOSTER',
  desc: ['You can place exactly two people immediately after one another if at least one of them uses the __Sheep Market__, __Pig Market__, or __Cattle Market__ accumulation space.'],
  cost: { reed: 1 },
})
