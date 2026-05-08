import { MinorImprovement } from '../types'

const CARD_ID = 'C21_HeartofStone'

export const C21_HeartofStone = new MinorImprovement({
  id: CARD_ID,
  name: 'Heart of Stone',
  deck: 'C',
  number: 21,
  category: 'ACTIONS_BOOSTER',
  desc: [
    'Each time a __Quarry__ accumulation space is revealed, if you have room in your house, you can immediately take a __Family Growth__ action without placing a person.',
  ],
  cost: { food: 4 },
  newSet: true,
})
