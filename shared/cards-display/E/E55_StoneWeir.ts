import { MinorImprovement } from '../types'

const CARD_ID = 'E55_StoneWeir'

export const E55_StoneWeir = new MinorImprovement({
  id: CARD_ID,
  name: 'Stone Weir',
  deck: 'E',
  number: 55,
  category: 'FOOD',
  desc: ['Each time you use the __Fishing__ accumulation space, if there are 0/1/2/3 <FOOD> on the space, you get an additional 4/3/2/1 <FOOD> from the general supply.'],
  cost: { stone: 1 },
  vp: 1,
  prerequisite: '2 Occupations',
  occupationPrerequisites: { min: 2 },
})
