import { MinorImprovement } from '../types'

const CARD_ID = 'A68_AsparagusGift'

export const A68_AsparagusGift = new MinorImprovement({
  id: CARD_ID,
  name: 'Asparagus Gift',
  deck: 'A',
  number: 68,
  category: 'CROP_PROVIDER',
  desc: ['Each time you build a number of fences equal to or greater than the current round, you immediately get 1 <VEGETABLE>.'],
  cost: {},
  prerequisite: '1 Unplanted Field',
})
