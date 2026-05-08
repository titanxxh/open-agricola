import { MinorImprovement } from '../types'

const CARD_ID = 'D45_SheepWell'

export const D45_SheepWell = new MinorImprovement({
  id: CARD_ID,
  name: 'Sheep Well',
  deck: 'D',
  number: 45,
  category: 'FOOD_PROVIDER',
  desc: ['Place 1 <FOOD> on each of the next round spaces, up to the number of <SHEEP> you have. At the start of these rounds, you get the <FOOD>.'],
  cost: { stone: 2 },
  vp: 2,
})
