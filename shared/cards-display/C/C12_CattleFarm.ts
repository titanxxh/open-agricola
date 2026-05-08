import { MinorImprovement } from '../types'

const CARD_ID = 'C12_CattleFarm'

export const C12_CattleFarm = new MinorImprovement({
  id: CARD_ID,
  name: 'Cattle Farm',
  deck: 'C',
  number: 12,
  category: 'FARM_PLANNER',
  desc: ['For each pasture you have, you can keep 1 <CATTLE> on this card.'],
  cost: { wood: 1 },
})
