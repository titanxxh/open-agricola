import { MinorImprovement } from '../types'

const CARD_ID = 'A51_DriftNetBoat'

export const A51_DriftNetBoat = new MinorImprovement({
  id: CARD_ID,
  name: 'Drift-Net Boat',
  deck: 'A',
  number: 51,
  category: 'FOOD_PROVIDER',
  desc: ['Each time you use the __Fishing__ accumulation space, you get an additional 2 <FOOD>.'],
  cost: { wood: 1, reed: 1 },
  vp: 1,
})
