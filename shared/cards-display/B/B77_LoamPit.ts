import { MinorImprovement } from '../types'

const CARD_ID = 'B77_LoamPit'

export const B77_LoamPit = new MinorImprovement({
  id: CARD_ID,
  name: 'Loam Pit',
  deck: 'B',
  number: 77,
  category: 'BUILDING_RESOURCE_PROVIDER',
  desc: ['Each time you use the __Day Laborer__ action space, you also get 3 <CLAY>.'],
  vp: 1,
  cost: { food: 1 },
  prerequisite: '3 Occupations',
  occupationPrerequisites: { min: 3 },
})
