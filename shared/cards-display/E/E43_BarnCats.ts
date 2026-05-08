import { MinorImprovement } from '../types'

const CARD_ID = 'E43_BarnCats'

export const E43_BarnCats = new MinorImprovement({
  id: CARD_ID,
  name: 'Barn Cats',
  deck: 'E',
  number: 43,
  category: 'FOOD_-_FUTURE_ROUND_SPACES',
  desc: ['If you have 1/2/3/4 stables, place 1 <FOOD> on each of the next 2/3/4/5 round spaces. At the start of these rounds, you get the <FOOD>.'],
  vp: 1,
  prerequisite: '1 Stable',
})
