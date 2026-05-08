import { Occupation } from '../types'

const CARD_ID = 'C159_FishermansFriend'

export const C159_FishermansFriend = new Occupation({
  id: CARD_ID,
  name: "Fisherman's Friend",
  deck: 'C',
  number: 159,
  category: 'FOOD_PROVIDER',
  desc: ['At the start of each round, if there is more <FOOD> on the __Traveling Players__ than on the __Fishing__ accumulation space, you get the difference from the general supply.'],
  cost: {},
  players: '4+',
  newSet: true,
})
