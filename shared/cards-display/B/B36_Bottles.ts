import { MinorImprovement } from '../types'

const CARD_ID = 'B36_Bottles'

export const B36_Bottles = new MinorImprovement({
  id: CARD_ID,
  name: 'Bottles',
  deck: 'B',
  number: 36,
  category: 'POINTS_PROVIDER',
  desc: ['For each person you have, you must pay an additional 1 <CLAY> and 1 <FOOD> to play this card.'],
  cost: {},
  vp: 4,
})
