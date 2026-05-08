import { MinorImprovement } from '../types'

const CARD_ID = 'B30_WoodPalisades'

export const B30_WoodPalisades = new MinorImprovement({
  id: CARD_ID,
  name: 'Wood Palisades',
  deck: 'B',
  number: 30,
  category: 'POINTS_PROVIDER',
  desc: ['Instead of a fence piece, you can place 2 <WOOD> from your supply on the fence spaces at the edge of your farmyard. These fence spaces with 2 <WOOD> are each worth 1 <SCORE>.'],
  cost: { food: 1 },
  vp: 0,
  enablesPalisades: true,
})
