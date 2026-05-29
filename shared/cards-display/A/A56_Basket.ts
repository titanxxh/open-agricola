import { MinorImprovement } from '../types'

const CARD_ID = 'A56_Basket'

export const A56_Basket = new MinorImprovement({
  id: CARD_ID,
  name: 'Basket',
  deck: 'A',
  number: 56,
  category: 'FOOD_PROVIDER',
  desc: ['Immediately after each time you use a wood accumulation space, you can exchange 2 <WOOD> for 3 <FOOD>. If you do, place those 2 <WOOD> on the accumulation space.'],
  cost: { reed: 1 },
  waresSalesmanGains: [{ wood: 1, reed: 1 }],
})
