import { MinorImprovement } from '../types'

const CARD_ID = 'B17_ForestPlow'

export const B17_ForestPlow = new MinorImprovement({
  id: CARD_ID,
  name: 'Forest Plow',
  deck: 'B',
  number: 17,
  category: 'FARM_PLANNER',
  desc: ['Each time after you use a wood accumulation space, you can pay 2 <WOOD> to plow 1 field. Place the paid <WOOD> on the accumulation space (for the next visitor).'],
  cost: { wood: 1 },
})
