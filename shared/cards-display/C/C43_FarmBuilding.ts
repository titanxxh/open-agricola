import { MinorImprovement } from '../types'

const CARD_ID = 'C43_FarmBuilding'

export const C43_FarmBuilding = new MinorImprovement({
  id: CARD_ID,
  name: 'Farm Building',
  deck: 'C',
  number: 43,
  category: 'FOOD_PROVIDER',
  desc: [
    'Each time you build a major improvement, place 1 <FOOD> on each of the next 3 round spaces. At the start of these rounds, you get the <FOOD>.',
  ],
  cost: { clay: 1, reed: 1 },
  vp: 1,
})
