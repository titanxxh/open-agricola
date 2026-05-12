import { MinorImprovement } from '../types'

const CARD_ID = 'B28_ForestryStudies'

export const B28_ForestryStudies = new MinorImprovement({
  id: CARD_ID,
  name: 'Forestry Studies',
  deck: 'B',
  number: 28,
  category: 'ACTIONS_BOOSTER',
  desc: ['Each time after you use the __Forest__ accumulation space, you can return 2 <WOOD> to that space to play 1 occupation without paying an occupation costs.'],
  cost: { food: 2 },
})
