import { MinorImprovement } from '../types'

const CARD_ID = 'D67_ReapHook'

export const D67_ReapHook = new MinorImprovement({
  id: CARD_ID,
  name: 'Reap Hook',
  deck: 'D',
  number: 67,
  category: 'CROP_PROVIDER',
  desc: ['Place 1 <GRAIN> on each of the next 3 of the round spaces 4, 7, 9, 11, 13, and 14. At the start of these rounds, you get the <GRAIN>.'],
  cost: { wood: 1 },
})
