import { MinorImprovement } from '../types'

const CARD_ID = 'A49_NestSite'

export const A49_NestSite = new MinorImprovement({
  id: CARD_ID,
  name: 'Nest Site',
  deck: 'A',
  number: 49,
  category: 'FOOD_PROVIDER',
  desc: ['Each time 1 <REED> is placed on a non-empty __Reed Bank__ accumulation space during the preparation phase, you get 1 <FOOD>.'],
  cost: { food: 1 },
  prerequisite: '1 Occupation',
  occupationPrerequisites: { min: 1 },
})
