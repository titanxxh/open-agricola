import { MinorImprovement } from '../types'

const CARD_ID = 'B69_PottersMarket'

export const B69_PottersMarket = new MinorImprovement({
  id: CARD_ID,
  name: "Potter's Market",
  deck: 'B',
  number: 69,
  category: 'CROP_PROVIDER',
  desc: ['At any time, you can pay 3 <CLAY> and 2 <FOOD>. If you do, place 1 <VEGETABLE> on each of the next 2 round spaces. At the start of these rounds, you get the <VEGETABLE>.'],
  cost: { wood: 2 },
  vp: 1,
})
