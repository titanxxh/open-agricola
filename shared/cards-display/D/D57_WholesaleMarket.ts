import { MinorImprovement } from '../types'

const CARD_ID = 'D57_WholesaleMarket'

export const D57_WholesaleMarket = new MinorImprovement({
  id: CARD_ID,
  name: 'Wholesale Market',
  deck: 'D',
  number: 57,
  category: 'FOOD_PROVIDER',
  desc: ['Place 1 <FOOD> on each remaining round space. At the start of these rounds, you get the <FOOD>.'],
  cost: { wood: 2, vegetable: 2 },
  vp: 3,
  newSet: true,
})
