import { MinorImprovement } from '../types'

const CARD_ID = 'E58_LunchtimeBeer'

export const E58_LunchtimeBeer = new MinorImprovement({
  id: CARD_ID,
  name: 'Lunchtime Beer',
  deck: 'E',
  number: 58,
  category: 'FOOD',
  desc: ['At the start of each harvest, you can choose to skip the field and breeding phase of that harvest and get exactly 1 <FOOD> instead.'],
  cost: {},
})
