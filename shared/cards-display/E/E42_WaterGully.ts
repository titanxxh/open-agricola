import { MinorImprovement } from '../types'

const CARD_ID = 'E42_WaterGully'

export const E42_WaterGully = new MinorImprovement({
  id: CARD_ID,
  name: 'Water Gully',
  deck: 'E',
  number: 42,
  category: 'GOODS_-_GET',
  desc: ['Place 1 <CATTLE>, 1 <GRAIN>, and 1 <CATTLE> on the next 3 round spaces (in that order). At the start of these rounds, you get the respective good.'],
  cost: { stone: 1 },
  prerequisite: 'Major Well',
})
