import { MinorImprovement } from '../types'

const CARD_ID = 'E8_FarmersMarket'

export const E8_FarmersMarket = new MinorImprovement({
  id: CARD_ID,
  name: "Farmer's Market",
  deck: 'E',
  number: 8,
  category: 'PASSING_-_CROP',
  desc: ['You immediately get 1 <VEGETABLE>. (Effectively, you are buying 1 <VEGETABLE> for 2 <FOOD>.)'],
  cost: { food: 2 },
  passing: true,
})
