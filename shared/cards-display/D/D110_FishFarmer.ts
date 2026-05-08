import { Occupation } from '../types'

const CARD_ID = 'D110_FishFarmer'

export const D110_FishFarmer = new Occupation({
  id: CARD_ID,
  name: 'Fish Farmer',
  deck: 'D',
  number: 110,
  category: 'FOOD_PROVIDER',
  desc: [
    'Each time there is 1/2/3+ food on the __Fishing__ accumulation space, you get an additional 2 <FOOD> on the __Reed Bank__/ __Clay Pit__/ __Forest__ accumulation spaces.',
  ],
  cost: {},
  players: '1+',
  newSet: true,
})
