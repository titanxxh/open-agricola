import { MinorImprovement } from '../types'

const CARD_ID = 'E50_WildGreens'

export const E50_WildGreens = new MinorImprovement({
  id: CARD_ID,
  name: 'Wild Greens',
  deck: 'E',
  number: 50,
  category: 'FOOD',
  desc: ['Each time you sow, you get 1 <FOOD> for every different type of good that you sow.'],
  cost: {},
})
