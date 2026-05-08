import { MinorImprovement } from '../types'

const CARD_ID = 'E27_PiggyBank'

export const E27_PiggyBank = new MinorImprovement({
  id: CARD_ID,
  name: 'Piggy Bank',
  deck: 'E',
  number: 27,
  desc: ['At the end of each work phase, you can place 1 <FOOD> on this card, irretrievably. At any time, you can discard 6 <FOOD> from this card to build a major improvement at no cost.'],
  cost: {},
})
