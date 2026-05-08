import { MinorImprovement } from '../types'

const CARD_ID = 'B78_ReedBelt'

export const B78_ReedBelt = new MinorImprovement({
  id: CARD_ID,
  name: 'Reed Belt',
  deck: 'B',
  number: 78,
  category: 'BUILDING_RESOURCE_PROVIDER',
  desc: ['Place 1 <REED> on each of the remaining space for rounds 5, 8, 10, and 12. At the start of these rounds, you get the <REED>.'],
  cost: { food: 2 },
})
