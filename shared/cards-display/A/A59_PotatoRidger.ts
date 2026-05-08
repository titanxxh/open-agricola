import { MinorImprovement } from '../types'

const CARD_ID = 'A59_PotatoRidger'

export const A59_PotatoRidger = new MinorImprovement({
  id: CARD_ID,
  name: 'Potato Ridger',
  deck: 'A',
  number: 59,
  category: 'FOOD_PROVIDER',
  desc: ['Each time after you harvest 1+ <VEGETABLE>, if you then have 3+ <VEGETABLE> in your supply, you can turn exactly 1 <VEGETABLE> into 6 <FOOD>. With 4+ <VEGETABLE>, you must do so.'],
  cost: { wood: 1 },
})
