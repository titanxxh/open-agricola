import { MinorImprovement } from '../types'

const CARD_ID = 'D68_SmallBasket'

export const D68_SmallBasket = new MinorImprovement({
  id: CARD_ID,
  name: 'Small Basket',
  deck: 'D',
  number: 68,
  category: 'CROP_PROVIDER',
  desc: ['Each time after you use the __Reed Bank__ accumulation space, you can pay 1 <REED> to get 1 <VEGETABLE>. If you do in a game with 4+ players, place that 1 <REED> on the accumulation space.'],
  cost: {},
  prerequisite: '2 Occupations',
  occupationPrerequisites: { min: 2 },
  newSet: true,
})
