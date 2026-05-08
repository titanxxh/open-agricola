import { MinorImprovement } from '../types'

const CARD_ID = 'E24_Ambition'

export const E24_Ambition = new MinorImprovement({
  id: CARD_ID,
  name: 'Ambition',
  deck: 'E',
  number: 24,
  category: 'ACTION',
  desc: ['Each time you get a __Minor Improvement__ action on an action space, you can build a major improvement instead of playing a minor one.'],
  cost: {},
  prerequisite: '2 Occupations',
  occupationPrerequisites: { min: 2 },
})
