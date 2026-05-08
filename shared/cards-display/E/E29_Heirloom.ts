import { MinorImprovement } from '../types'

const CARD_ID = 'E29_Heirloom'

export const E29_Heirloom = new MinorImprovement({
  id: CARD_ID,
  name: 'Heirloom',
  deck: 'E',
  number: 29,
  category: 'BONUS_POINTS_-_GET',
  desc: ['(This card has no additional effect.)'],
  cost: {},
  vp: 2,
  prerequisite: 'Your Person on Day Laborer',
  evenMoreSet: true,
})
