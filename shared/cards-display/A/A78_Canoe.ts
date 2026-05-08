import { MinorImprovement } from '../types'

const CARD_ID = 'A78_Canoe'

export const A78_Canoe = new MinorImprovement({
  id: CARD_ID,
  name: 'Canoe',
  deck: 'A',
  number: 78,
  category: 'BUILDING_RESOURCE_PROVIDER',
  desc: ['Each time you use the __Fishing__ accumulation space, you get an additional 1 <FOOD> and 1 <REED>.'],
  cost: { wood: 2 },
  vp: 1,
  prerequisite: '1 Occupation',
  occupationPrerequisites: { min: 1 },
})
