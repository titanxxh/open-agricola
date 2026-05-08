import { MinorImprovement } from '../types'

const CARD_ID = 'E56_RomanPot'

export const E56_RomanPot = new MinorImprovement({
  id: CARD_ID,
  name: 'Roman Pot',
  deck: 'E',
  number: 56,
  category: 'FOOD_-_FUTURE_ROUND_SPACES',
  desc: ['Place 4 <FOOD> from the general supply on this card. At the start of each work phase, if you are the last player in turn order, move 1 <FOOD> from this card to your supply.'],
  cost: { clay: 1 },
  vp: 1,
})
