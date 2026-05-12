import { MinorImprovement } from '../types'

const CARD_ID = 'B60_BrewingWater'

export const B60_BrewingWater = new MinorImprovement({
  id: CARD_ID,
  name: 'Brewing Water',
  deck: 'B',
  number: 60,
  category: 'FOOD_PROVIDER',
  desc: ['Each time you use the __Fishing__ accumulation space, you can pay 1 <GRAIN> to place 1 <FOOD> on each of the next 6 round spaces. At the start of these rounds, you get the <FOOD>.'],
  cost: {},
})
