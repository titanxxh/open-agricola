import { MinorImprovement } from '../types'

const CARD_ID = 'D15_ClaySupports'

export const D15_ClaySupports = new MinorImprovement({
  id: CARD_ID,
  name: 'Clay Supports',
  deck: 'D',
  number: 15,
  category: 'FARM_PLANNER',
  desc: ['Each time you build a clay room, you can pay 2 <CLAY>, 1 <WOOD>, and 1 <REED> instead of 5 <CLAY> and 2 <REED>.'],
  cost: { wood: 2 },
})
