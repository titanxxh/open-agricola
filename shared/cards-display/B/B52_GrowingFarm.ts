import { MinorImprovement } from '../types'

const CARD_ID = 'B52_GrowingFarm'

export const B52_GrowingFarm = new MinorImprovement({
  id: CARD_ID,
  name: 'Growing Farm',
  deck: 'B',
  number: 52,
  category: 'FOOD_PROVIDER',
  desc: ['You can only play this card if you have at least as many pasture spaces as the number of completed rounds. If you do, you get a number of <FOOD> equal to the current round.'],
  cost: { clay: 2, reed: 1 },
  vp: 2,
  prerequisite: 'Pasture Spaces >= Completed Rounds',
})
