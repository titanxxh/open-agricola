import { MinorImprovement } from '../types'

const CARD_ID = 'B32_Kettle'

// TODO: The original card awards 0/1/2 bonus VP when using the 1/3/5 grain tiers respectively.
// Our exchange system does not support VP scoring on exchanges, so VP is omitted here.
// The exchange rates for food are correct: 1 grain → 3 food, 3 grain → 4 food, 5 grain → 5 food.

export const B32_Kettle = new MinorImprovement({
  id: CARD_ID,
  name: 'Kettle',
  deck: 'B',
  number: 32,
  category: 'POINTS_PROVIDER',
  desc: ['At any time, you can exchange 1/3/5 <GRAIN> for 3/4/5 <FOOD> and 0/1/2 bonus <SCORE>.'],
  cost: { clay: 1 },
  prerequisite: '1 Grain Field',
  exchanges: [
    { from: { grain: 1 }, to: { food: 3 }, triggers: ['anytime'] },
    { from: { grain: 3 }, to: { food: 4 }, triggers: ['anytime'] },
    { from: { grain: 5 }, to: { food: 5 }, triggers: ['anytime'] },
  ],
})
