import { MinorImprovement } from '../types'

const CARD_ID = 'E67_GrainBag'

export const E67_GrainBag = new MinorImprovement({
  id: CARD_ID,
  name: 'Grain Bag',
  deck: 'E',
  number: 67,
  category: 'CROPS_-_GRAIN',
  desc: ['Each time you use the __Grain Seeds__ action space, you get 1 additional <GRAIN> for each <BAKE>-improvement you have.'],
  cost: { reed: 1 },
  vp: 1,
})
