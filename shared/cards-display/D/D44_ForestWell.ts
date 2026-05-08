import { MinorImprovement } from '../types'

const CARD_ID = 'D44_ForestWell'

export const D44_ForestWell = new MinorImprovement({
  id: CARD_ID,
  name: 'Forest Well',
  deck: 'D',
  number: 44,
  category: 'FOOD_PROVIDER',
  desc: ['Place 1 <FOOD> on each remaining round space, up to the amount of <WOOD> in your supply. At the start of these rounds, you get the <FOOD>.'],
  cost: { stone: 1, food: 1 },
  vp: 1,
  prerequisite: '2 Occupations',
  occupationPrerequisites: { min: 2 },
  newSet: true,
})
