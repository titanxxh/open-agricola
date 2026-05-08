import { MinorImprovement } from '../types'

const CARD_ID = 'D80_BrickHammer'

export const D80_BrickHammer = new MinorImprovement({
  id: CARD_ID,
  name: 'Brick Hammer',
  deck: 'D',
  number: 80,
  category: 'BUILDING_RESOURCE_PROVIDER',
  desc: ['Each time after you build an improvement costing at least 2 <CLAY>, you get 1 <STONE>.'],
  cost: { wood: 1 },
  altCosts: [{ food: 1 }],
  newSet: true,
})
