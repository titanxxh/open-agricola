import { MinorImprovement } from '../types'

const CARD_ID = 'D43_Hutch'

export const D43_Hutch = new MinorImprovement({
  id: CARD_ID,
  name: 'Hutch',
  deck: 'D',
  number: 43,
  category: 'FOOD_PROVIDER',
  desc: ['Place 0, 1, 2, and 3 <FOOD> in this order on the next 4 round spaces. At the start of these rounds, you get the <FOOD>.'],
  cost: { wood: 1, reed: 1 },
  vp: 1,
})
