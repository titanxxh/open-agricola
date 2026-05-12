import { MinorImprovement } from '../types'

const CARD_ID = 'C45_Stew'

export const C45_Stew = new MinorImprovement({
  id: CARD_ID,
  name: 'Stew',
  deck: 'C',
  number: 45,
  category: 'FOOD_PROVIDER',
  desc: ['Each time you use the __Day Laborer__ action space, also place 1 <FOOD> on each of the next 4 round spaces. At the start of these rounds, you get the <FOOD>.'],
  cost: { clay: 1 },
})
