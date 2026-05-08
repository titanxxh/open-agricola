import { MinorImprovement } from '../types'

const CARD_ID = 'A75_LumberMill'

export const A75_LumberMill = new MinorImprovement({
  id: CARD_ID,
  name: 'Lumber Mill',
  deck: 'A',
  number: 75,
  category: 'BUILDING_RESOURCE_PROVIDER',
  desc: ['Every improvement costs you 1 <WOOD> less.'],
  cost: { stone: 2 },
  vp: 2,
  prerequisite: 'At most 3 Occupations',
  occupationPrerequisites: { max: 3 },
})
