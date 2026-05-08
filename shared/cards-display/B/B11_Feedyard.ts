import { MinorImprovement } from '../types'

const CARD_ID = 'B11_Feedyard'

export const B11_Feedyard = new MinorImprovement({
  id: CARD_ID,
  name: 'Feedyard',
  deck: 'B',
  number: 11,
  category: 'FARM_PLANNER',
  desc: ['This card can hold 1 animal for each pasture you have, even different types. After the breeding phase of each harvest, you get 1 <FOOD> for each unused spot on this card.'],
  cost: { clay: 1, grain: 1 },
  vp: 1,
})
