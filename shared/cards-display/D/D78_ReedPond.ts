import { MinorImprovement } from '../types'

const CARD_ID = 'D78_ReedPond'

export const D78_ReedPond = new MinorImprovement({
  id: CARD_ID,
  name: 'Reed Pond',
  deck: 'D',
  number: 78,
  category: 'BUILDING_RESOURCE_PROVIDER',
  desc: ['Place 1 <REED> on each of the next 3 round spaces. At the start of these rounds, you get the <REED>.'],
  cost: {},
  prerequisite: '3 Occupations',
  occupationPrerequisites: { min: 3 },
})
