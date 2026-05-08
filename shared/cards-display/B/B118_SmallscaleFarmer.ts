import { Occupation } from '../types'

const CARD_ID = 'B118_SmallscaleFarmer'

export const B118_SmallscaleFarmer = new Occupation({
  id: CARD_ID,
  name: 'Small-scale Farmer',
  deck: 'B',
  number: 118,
  category: 'BUILDING_RESOURCE_PROVIDER',
  desc: ['As long as you live in a house with exactly 2 rooms, at the start of each round, you get 1 <WOOD>.'],
  cost: {},
  players: '1+',
})
