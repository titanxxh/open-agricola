import { MinorImprovement } from '../types'

const CARD_ID = 'A44_PondHut'

export const A44_PondHut = new MinorImprovement({
  id: CARD_ID,
  name: 'Pond Hut',
  deck: 'A',
  number: 44,
  category: 'FOOD_PROVIDER',
  desc: ['Place 1 <FOOD> on each of the next 3 round spaces. At the start of these rounds, you get the <FOOD>.'],
  cost: { wood: 1 },
  vp: 1,
  prerequisite: 'Exactly 2 Occupations',
  occupationPrerequisites: { min: 2, max: 2 },
})
