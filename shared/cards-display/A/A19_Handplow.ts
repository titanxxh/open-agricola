import { MinorImprovement } from '../types'

const CARD_ID = 'A19_Handplow'

export const A19_Handplow = new MinorImprovement({
  id: CARD_ID,
  name: 'Handplow',
  deck: 'A',
  number: 19,
  category: 'FARM_PLANNER',
  desc: ['Add 5 to the current round and place 1 field tile on the corresponding round space. At the start of that round, you can plow the field.'],
  cost: { wood: 1 },
})
