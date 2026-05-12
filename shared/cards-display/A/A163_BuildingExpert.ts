import { Occupation } from '../types'

const CARD_ID = 'A163_BuildingExpert'

export const A163_BuildingExpert = new Occupation({
  id: CARD_ID,
  name: 'Building Expert',
  deck: 'A',
  number: 163,
  category: 'BUILDING_RESOURCE_PROVIDER',
  desc: ['Each time you use the __Resource Market__ action space with the 1st/2nd/3rd/4th/5th person you place, you also get 1 <WOOD>/<CLAY>/<REED>/<STONE>/<STONE>.'],
  cost: {},
  players: '4+',
})
