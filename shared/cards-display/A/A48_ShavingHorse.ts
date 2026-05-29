import { MinorImprovement } from '../types'

const CARD_ID = 'A48_ShavingHorse'

export const A48_ShavingHorse = new MinorImprovement({
  id: CARD_ID,
  name: 'Shaving Horse',
  deck: 'A',
  number: 48,
  category: 'FOOD_PROVIDER',
  desc: ['Each time after you obtain at least 1 <WOOD>, if you then have 5 or more <WOOD> in your supply, you can exchange 1 <WOOD> for 3 <FOOD>. With 7 or more <WOOD>, you must do so.'],
  cost: { wood: 1 },
  waresSalesmanGains: [{ wood: 1, reed: 1 }],
})
