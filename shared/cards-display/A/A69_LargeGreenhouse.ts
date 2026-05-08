import { MinorImprovement } from '../types'

const CARD_ID = 'A69_LargeGreenhouse'

export const A69_LargeGreenhouse = new MinorImprovement({
  id: CARD_ID,
  name: 'Large Greenhouse',
  deck: 'A',
  number: 69,
  category: 'CROP_PROVIDER',
  desc: ['Add 4, 7, and 9 to the current round and place 1 <VEGETABLE> on each corresponding round space. At the start of these rounds, you get the <VEGETABLE>.'],
  cost: { wood: 2 },
  prerequisite: '2 Occupations',
  occupationPrerequisites: { min: 2 },
})
