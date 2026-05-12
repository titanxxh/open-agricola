import { MinorImprovement } from '../types'

const CARD_ID = 'A30_BakingSheet'

export const A30_BakingSheet = new MinorImprovement({
  id: CARD_ID,
  name: 'Baking Sheet',
  deck: 'A',
  number: 30,
  category: 'POINTS_PROVIDER',
  desc: ['Each time you take a __Bake Bread__ action, you can use this card to exchange exactly 1 <GRAIN> for 2 <FOOD> and 1 bonus <SCORE>.'],
  cost: {},
  prerequisite: 'No Grain Field',
  extraVp: true,
})
