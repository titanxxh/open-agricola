import { MinorImprovement } from '../types'

const CARD_ID = 'E31_Upholstery'

export const E31_Upholstery = new MinorImprovement({
  id: CARD_ID,
  name: 'Upholstery',
  deck: 'E',
  number: 31,
  category: 'BONUS_POINTS_-_GET',
  desc: [
    'Each time you build or play an improvement after this one, you can place 1 <REED> on this card, irretrievably, to get 1 bonus <SCORE>, up to the number of rooms in your house.',
  ],
  cost: {},
  extraVp: true,
})
