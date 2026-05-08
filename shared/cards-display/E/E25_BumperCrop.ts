import { MinorImprovement } from '../types'

const CARD_ID = 'E25_BumperCrop'

export const E25_BumperCrop = new MinorImprovement({
  id: CARD_ID,
  name: 'Bumper Crop',
  deck: 'E',
  number: 25,
  category: 'ACTION',
  desc: ['When you play this card, immediately carry out the field phase on your farmyard only. (This is not a harvest.)'],
  vp: 1,
  prerequisite: '2 Grain Fields',
  newSet: true,
})
