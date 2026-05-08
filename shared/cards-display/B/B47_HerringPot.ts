import { MinorImprovement } from '../types'

const CARD_ID = 'B47_HerringPot'

export const B47_HerringPot = new MinorImprovement({
  id: CARD_ID,
  name: 'Herring Pot',
  deck: 'B',
  number: 47,
  category: 'FOOD_PROVIDER',
  desc: ['Each time you use the __Fishing__ accumulation space, place 1 <FOOD> on each of the next 3 round spaces. At the start of these rounds, you get the <FOOD>.'],
  cost: { clay: 1 },
})
