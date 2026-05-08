import { MinorImprovement } from '../types'

const CARD_ID = 'E45_FruitLadder'

export const E45_FruitLadder = new MinorImprovement({
  id: CARD_ID,
  name: 'Fruit Ladder',
  deck: 'E',
  number: 45,
  category: 'FOOD',
  desc: ['Place 1 <FOOD> on each remaining even-numbered round space. At the start of these rounds, you get the <FOOD>.'],
  vp: 1,
  cost: { wood: 2 },
})
