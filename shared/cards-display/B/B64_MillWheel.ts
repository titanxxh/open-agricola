import { MinorImprovement } from '../types'

const CARD_ID = 'B64_MillWheel'

export const B64_MillWheel = new MinorImprovement({
  id: CARD_ID,
  name: 'Mill Wheel',
  deck: 'B',
  number: 64,
  category: 'FOOD_PROVIDER',
  desc: ['Each time you use the __Grain Utilization__ action space while the __Fishing__ accumulation space is occupied, you get an additional 2 <FOOD>.'],
  vp: 1,
  cost: { wood: 2 },
  newSet: true,
})
