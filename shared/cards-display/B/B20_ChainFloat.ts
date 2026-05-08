import { MinorImprovement } from '../types'

const CARD_ID = 'B20_ChainFloat'

export const B20_ChainFloat = new MinorImprovement({
  id: CARD_ID,
  name: 'Chain Float',
  deck: 'B',
  number: 20,
  category: 'FARM_PLANNER',
  desc: ['Add 7, 8, and 9 to the current round and place 1 field on each corresponding round space. At the start of these rounds, you can plow the field.'],
  cost: { wood: 3 },
})
