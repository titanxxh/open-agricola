import { MinorImprovement } from '../types'

const CARD_ID = 'A47_Trellises'

export const A47_Trellises = new MinorImprovement({
  id: CARD_ID,
  name: 'Trellises',
  deck: 'A',
  number: 47,
  category: 'FOOD_PROVIDER',
  desc: ['Immediately place 1 <FOOD> on each of the next round spaces, up to the number of fences you have built. At the start of these rounds, you get the <FOOD>.'],
  cost: { wood: 1 },
  newSet: true,
})
