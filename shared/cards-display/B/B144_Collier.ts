import { Occupation } from '../types'

const CARD_ID = 'B144_Collier'

export const B144_Collier = new Occupation({
  id: CARD_ID,
  name: 'Collier',
  deck: 'B',
  number: 144,
  category: 'BUILDING_RESOURCE_PROVIDER',
  desc: ['Each time after you use the __Clay Pit__ or __Hollow__ accumulation space, you get 1 <WOOD>. On __Clay Pit__ you also get 1 additional <REED>.'],
  cost: {},
  players: '3+',
})
