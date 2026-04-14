import { Occupation } from '../types'

const CARD_ID = 'A89_StablePlanner'

// BGA: Add 3, 6, and 9 to the current round; place 1 stable meeple on each corresponding
// round space. At the start of those rounds, build the stable at no cost.
// Simplified: onBuy is not implemented (requires SPECIAL_EFFECT / placeFutureStables mechanism
// which is not yet supported in the TS engine).

export const A89_StablePlanner = new Occupation({
  id: CARD_ID,
  name: 'Stable Planner',
  deck: 'A',
  number: 89,
  category: 'FARM_PLANNER',
  desc: ['Add 3, 6, and 9 to the current round. You can place 1 stable on each corresponding round space. At the start of these rounds (not earlier), you can build the stable at no cost.'],
  cost: {},
  players: '1+',
  newSet: true,
})
