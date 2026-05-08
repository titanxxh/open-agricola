import { MinorImprovement } from '../types'

const CARD_ID = 'D54_TroutPool'

export const D54_TroutPool = new MinorImprovement({
  id: CARD_ID,
  name: 'Trout Pool',
  deck: 'D',
  number: 54,
  category: 'FOOD_PROVIDER',
  desc: ['At the start of each work phase, if there are at least 3 <FOOD> on the __Fishing__ accumulation space, you get 1 <FOOD> from the general supply.'],
  cost: { clay: 2 },
  vp: 1,
  newSet: true,
})
