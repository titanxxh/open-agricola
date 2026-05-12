import { MinorImprovement } from '../types'

const CARD_ID = 'A42_ForestLakeHut'

export const A42_ForestLakeHut = new MinorImprovement({
  id: CARD_ID,
  name: 'Forest Lake Hut',
  deck: 'A',
  number: 42,
  category: 'GOODS_PROVIDER',
  desc: ['Each time you use the __Fishing__/__Forest__ accumulation space, you also get 1 <WOOD>/<FOOD>.'],
  cost: { clay: 2 },
  vp: 1,
})
