import { MinorImprovement } from '../types'

const CARD_ID = 'D24_BrotherlyLove'

export const D24_BrotherlyLove = new MinorImprovement({
  id: CARD_ID,
  name: 'Brotherly Love',
  deck: 'D',
  number: 24,
  category: 'ACTIONS_BOOSTER',
  desc: [
    'As long as you have exactly 4 people, in the work phase of each round, you can place your third and fourth person immediately after one another, even on the same action space.',
  ],
  cost: { food: 1 },
})
