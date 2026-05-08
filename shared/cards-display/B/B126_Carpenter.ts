import { Occupation } from '../types'

const CARD_ID = 'B126_Carpenter'

export const B126_Carpenter = new Occupation({
  id: CARD_ID,
  name: 'Carpenter',
  deck: 'B',
  number: 126,
  category: 'BUILDING_RESOURCE_PROVIDER',
  desc: ['Every new room only costs you 3 of the appropriate building resource and 2 <REED> (e.g. if you live in a wooden house, 3 <WOOD> and 2 <REED>).'],
  cost: {},
  players: '1+',
})
