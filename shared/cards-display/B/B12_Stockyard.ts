import { MinorImprovement } from '../types'

const CARD_ID = 'B12_Stockyard'

export const B12_Stockyard = new MinorImprovement({
  id: CARD_ID,
  name: 'Stockyard',
  deck: 'B',
  number: 12,
  category: 'FARM_PLANNER',
  desc: ['This card can hold up to 3 animals of the same type. (It is not considered a pasture).'],
  cost: { wood: 1, stone: 1 },
  animalHolder: true,
  vp: 1,
})
