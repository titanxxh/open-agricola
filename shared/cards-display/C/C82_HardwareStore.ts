import { MinorImprovement } from '../types'

const CARD_ID = 'C82_HardwareStore'

export const C82_HardwareStore = new MinorImprovement({
  id: CARD_ID,
  name: 'Hardware Store',
  deck: 'C',
  number: 82,
  category: 'BUILDING_RESOURCE_PROVIDER',
  desc: ['Each time after you use the __Day Laborer__ action space, you can pay 2 <FOOD> total to buy 1 <WOOD>, 1 <CLAY>, 1 <REED>, and 1 <STONE>.'],
  vp: 1,
  cost: { wood: 1, clay: 1 },
})
