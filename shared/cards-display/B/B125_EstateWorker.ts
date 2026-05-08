import { Occupation } from '../types'

const CARD_ID = 'B125_EstateWorker'

export const B125_EstateWorker = new Occupation({
  id: CARD_ID,
  name: 'Estate Worker',
  deck: 'B',
  number: 125,
  category: 'BUILDING_RESOURCE_PROVIDER',
  desc: ['Place 1 <WOOD>, 1 <CLAY>, 1 <REED>, and 1 <STONE> in this order on the next 4 round spaces. At the start of these rounds, you get the respective building resource.'],
  cost: {},
  players: '1+',
})
