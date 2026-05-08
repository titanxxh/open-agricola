import { MinorImprovement } from '../types'

const CARD_ID = 'A35_SwimmingClass'

export const A35_SwimmingClass = new MinorImprovement({
  id: CARD_ID,
  name: 'Swimming Class',
  deck: 'A',
  number: 35,
  category: 'POINTS_PROVIDER',
  desc: ['In the returning home phase of each round, if you return a person from the __Fishing__ accumulation space, you get 2 bonus <SCORE> for each newborn that you return home.'],
  cost: { food: 1 },
  prerequisite: '2 Occupations',
  occupationPrerequisites: { min: 2 },
  newSet: true,
  extraVp: true,
})
