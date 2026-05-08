import { MinorImprovement } from '../types'

const CARD_ID = 'B44_ChickStable'

export const B44_ChickStable = new MinorImprovement({
  id: CARD_ID,
  name: 'Chick Stable',
  deck: 'B',
  number: 44,
  category: 'FOOD_PROVIDER',
  desc: ['Add 3 and 4 to the current round and place 2 <FOOD> on each corresponding round space. At the start of these rounds, you get the <FOOD>.'],
  cost: {},
  altCosts: [{ wood: 1 }, { clay: 1 }],
})
