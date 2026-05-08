import { Occupation } from '../types'

const CARD_ID = 'E122_Cottar'

export const E122_Cottar = new Occupation({
  id: CARD_ID,
  name: 'Cottar',
  deck: 'E',
  number: 122,
  category: 'BUILDING_RESOURCES_-_CLAY',
  desc: [
    'Each time you play or build an improvement, you get your choice of 1 <WOOD> or 1 <CLAY> immediately after paying its cost.',
  ],
  cost: {},
  players: '1+',
})
