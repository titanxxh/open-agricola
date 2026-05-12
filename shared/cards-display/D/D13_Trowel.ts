import { MinorImprovement } from '../types'

const CARD_ID = 'D13_Trowel'

export const D13_Trowel = new MinorImprovement({
  id: CARD_ID,
  name: 'Trowel',
  deck: 'D',
  number: 13,
  category: 'FARM_PLANNER',
  desc: [
    'At any time, you can renovate your house to stone. From a wooden house, this costs 1 <STONE>, 1 <REED>, and 1 <FOOD> per room. From a clay house, this costs 1 <STONE> per room.',
  ],
  cost: { wood: 1 },
})
