import { MinorImprovement } from '../types'

const CARD_ID = 'D12_MilkingPlace'

export const D12_MilkingPlace = new MinorImprovement({
  id: CARD_ID,
  name: 'Milking Place',
  deck: 'D',
  number: 12,
  category: 'FARM_PLANNER',
  desc: ['In the feeding phase of each harvest, you get 1 <FOOD>. You can no longer hold animals in your house (not even via another card).'],
  cost: { grain: 1 },
  vp: 1,
})
