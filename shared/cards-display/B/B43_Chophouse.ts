import { MinorImprovement } from '../types'

const CARD_ID = 'B43_Chophouse'

export const B43_Chophouse = new MinorImprovement({
  id: CARD_ID,
  name: 'Chophouse',
  deck: 'B',
  number: 43,
  category: 'FOOD_PROVIDER',
  desc: ['Each time you use the __Grain/Vegetable Seeds__ action space, place 1 <FOOD> on each of the next 3/2 round spaces. At the start of these rounds, you get the <FOOD>.'],
  vp: 1,
  altCosts: [{ wood: 2 }, { clay: 2 }],
})
