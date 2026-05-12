import { MinorImprovement } from '../types'

const CARD_ID = 'A66_FeedingDish'

export const A66_FeedingDish = new MinorImprovement({
  id: CARD_ID,
  name: 'Feeding Dish',
  deck: 'A',
  number: 66,
  category: 'CROP_PROVIDER',
  desc: ['Each time you use an animal accumulation space while already having an animal of that type, you get 1 <GRAIN>.'],
  cost: { wood: 1 },
})
