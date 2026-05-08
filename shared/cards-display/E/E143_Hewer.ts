import { Occupation } from '../types'

const CARD_ID = 'E143_Hewer'

export const E143_Hewer = new Occupation({
  id: CARD_ID,
  name: 'Hewer',
  deck: 'E',
  number: 143,
  category: 'BUILDING_RESOURCES_-_CLAY_OR_STONE',
  desc: [
    'From round 3 on, at the end of each work phase in which all clay accumulation spaces are unoccupied, you get 1 <STONE> and 1 <FOOD>.',
  ],
  cost: {},
  players: '3+',
})
