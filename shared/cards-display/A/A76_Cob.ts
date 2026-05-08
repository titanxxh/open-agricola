import { MinorImprovement } from '../types'

const CARD_ID = 'A76_Cob'

export const A76_Cob = new MinorImprovement({
  id: CARD_ID,
  name: 'Cob',
  deck: 'A',
  number: 76,
  category: 'BUILDING_RESOURCE_PROVIDER',
  desc: ['At the start of each work phase, if you have at least 1 <CLAY> in your supply, you can exchange exactly 1 <GRAIN> for 2 <CLAY> and 1 <FOOD>.'],
  cost: { food: 1 },
  newSet: true,
})
