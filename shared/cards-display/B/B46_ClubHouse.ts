import { MinorImprovement } from '../types'

const CARD_ID = 'B46_ClubHouse'

export const B46_ClubHouse = new MinorImprovement({
  id: CARD_ID,
  name: 'Club House',
  deck: 'B',
  number: 46,
  category: 'FOOD_PROVIDER',
  desc: ['Place 1 <FOOD> on each of the next 4 round spaces and 1 <STONE> on the round space after that. At the start of these rounds, you get the respective good.'],
  cost: {},
  altCosts: [{ wood: 3 }, { clay: 2 }],
  vp: 1,
})
