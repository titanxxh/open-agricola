import { MinorImprovement } from '../types'

const CARD_ID = 'E7_Pumpernickel'

export const E7_Pumpernickel = new MinorImprovement({
  id: CARD_ID,
  name: 'Pumpernickel',
  deck: 'E',
  number: 7,
  category: 'PASSING_-_FOOD',
  desc: ['You immediately get 4 <FOOD>. (Effectively, you are turning 1 <GRAIN> into 4 <FOOD>.)'],
  cost: { grain: 1 },
  passing: true,
})
