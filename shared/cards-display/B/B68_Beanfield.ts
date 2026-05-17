import { MinorImprovement } from '../types'

const CARD_ID = 'B68_Beanfield'

export const B68_Beanfield = new MinorImprovement({
  id: CARD_ID,
  name: 'Beanfield',
  deck: 'B',
  number: 68,
  category: 'CROP_PROVIDER',
  desc: ['This card is a field that can only grow vegetables.'],
  cost: { food: 1 },
  vp: 1,
  prerequisite: '2 Occupations',
  occupationPrerequisites: { min: 2 },
  isField: true,
  cardField: { allowedCrops: ['vegetable'], capacity: 1 },
})
