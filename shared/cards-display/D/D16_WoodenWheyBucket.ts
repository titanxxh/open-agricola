import { MinorImprovement } from '../types'

const CARD_ID = 'D16_WoodenWheyBucket'

export const D16_WoodenWheyBucket = new MinorImprovement({
  id: CARD_ID,
  name: 'Wooden Whey Bucket',
  deck: 'D',
  number: 16,
  category: 'FARM_PLANNER',
  desc: ['Each time before you use the __Sheep Market__/__Cattle Market__ accumulation space, you can build exactly 1 stable for 1 <WOOD>/at no cost.'],
  cost: { wood: 1, food: 1 },
  newSet: true,
})
