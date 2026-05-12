import { MinorImprovement } from '../types'

const CARD_ID = 'D6_PetrifiedWood'

export const D6_PetrifiedWood = new MinorImprovement({
  id: CARD_ID,
  name: 'Petrified Wood',
  deck: 'D',
  number: 6,
  category: 'BUILDING_RESOURCE_PROVIDER',
  desc: ['Immediately exchange up to 3 <WOOD> for 1 <STONE> each.'],
  cost: {},
  passing: true,
  prerequisite: '2 Occupations',
  occupationPrerequisites: { min: 2 },
})
