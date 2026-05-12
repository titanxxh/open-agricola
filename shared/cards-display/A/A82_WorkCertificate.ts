import { MinorImprovement } from '../types'

const CARD_ID = 'A82_WorkCertificate'

export const A82_WorkCertificate = new MinorImprovement({
  id: CARD_ID,
  name: 'Work Certificate',
  deck: 'A',
  number: 82,
  category: 'BUILDING_RESOURCE_PROVIDER',
  desc: ['Each time after you use an action space, you can take 1 building resource from a building resource accumulation space with at least 4 building resources on it.'],
  cost: { food: 1 },
  prerequisite: '3 Occupations',
  occupationPrerequisites: { min: 3 },
})
