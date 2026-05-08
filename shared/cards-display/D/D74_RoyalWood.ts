import { MinorImprovement } from '../types'

const CARD_ID = 'D74_RoyalWood'

export const D74_RoyalWood = new MinorImprovement({
  id: CARD_ID,
  name: 'Royal Wood',
  deck: 'D',
  number: 74,
  category: 'BUILDING_RESOURCE_PROVIDER',
  desc: [
    'At the end of each turn in which you use the __Farm Expansion__ action space or build an improvement, you get 1 <WOOD> back for every 2 <WOOD> paid during those actions (rounded down).',
  ],
  cost: { food: 1 },
})
