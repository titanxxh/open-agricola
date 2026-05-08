import { MinorImprovement } from '../types'

const CARD_ID = 'B13_CarpentersParlor'

export const B13_CarpentersParlor = new MinorImprovement({
  id: CARD_ID,
  name: "Carpenter's Parlor",
  deck: 'B',
  number: 13,
  category: 'FARM_PLANNER',
  desc: ['Wooden rooms only cost you 2 <WOOD> and 2 <REED> each.'],
  cost: { wood: 1, stone: 1 },
})
