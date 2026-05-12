import { Occupation } from '../types'

const CARD_ID = 'A141_TurnipFarmer'

export const A141_TurnipFarmer = new Occupation({
  id: CARD_ID,
  name: 'Turnip Farmer',
  deck: 'A',
  number: 141,
  category: 'CROP_PROVIDER',
  desc: ['At the start of the returning home phase of each round, if both the __Day Laborer__ and __Grain Seeds__ action spaces are occupied, you get 1 <VEGETABLE>.'],
  cost: {},
  players: '3+',
})
