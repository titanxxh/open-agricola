import { MinorImprovement } from '../types'

const CARD_ID = 'C15_Trellis'

export const C15_Trellis = new MinorImprovement({
  id: CARD_ID,
  name: 'Trellis',
  deck: 'C',
  number: 15,
  category: 'FARM_PLANNER',
  desc: ['Each time before you use the __Pig Market__ accumulation space, you can take a __Build Fences__ action. (You must pay <WOOD> for the fences as usual.)'],
  cost: {},
  prerequisite: '2 Occupations',
  occupationPrerequisites: { min: 2 },
})
