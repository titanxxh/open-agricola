import { Occupation } from '../types'

const CARD_ID = 'D120_ClayDeliveryman'

export const D120_ClayDeliveryman = new Occupation({
  id: CARD_ID,
  name: 'Clay Deliveryman',
  deck: 'D',
  number: 120,
  category: 'BUILDING_RESOURCE_PROVIDER',
  desc: ['Place 1 <CLAY> on each remaining space for rounds 6 to 14. At the start of these rounds, you get the <CLAY>.'],
  cost: {},
  players: '1+',
})
