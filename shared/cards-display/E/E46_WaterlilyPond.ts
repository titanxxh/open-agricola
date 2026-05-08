import { MinorImprovement } from '../types'

const CARD_ID = 'E46_WaterlilyPond'

export const E46_WaterlilyPond = new MinorImprovement({
  id: CARD_ID,
  name: 'Waterlily Pond',
  deck: 'E',
  number: 46,
  category: 'FOOD_-_FUTURE_ROUND_SPACES',
  desc: ['Place 1 <FOOD> on each of the next 2 round spaces. At the start of these rounds, you get the <FOOD>.'],
  vp: 1,
  prerequisite: 'Exactly 2 Occupations',
  occupationPrerequisites: { min: 2, max: 2 },
})
