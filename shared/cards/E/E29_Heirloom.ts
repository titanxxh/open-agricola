import { MinorImprovement } from '../types'

export const E29_Heirloom = new MinorImprovement({
  id: 'E29_Heirloom',
  name: 'Heirloom',
  deck: 'E',
  number: 29,
  category: 'BONUS_POINT_GENERATOR',
  desc: ['(This card has no additional effect.)'],
  cost: {},
  vp: 2,
  prerequisite: 'Your Person on Day Laborer',
})
