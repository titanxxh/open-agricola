import { Occupation } from '../types'

const CARD_ID = 'C117_Legworker'

export const C117_Legworker = new Occupation({
  id: CARD_ID,
  name: 'Legworker',
  deck: 'C',
  number: 117,
  category: 'BUILDING_RESOURCE_PROVIDER',
  desc: [
    'Each time you use an action space that is orthogonally adjacent to another action space occupied by one of your people, you get 1 <WOOD>.',
  ],
  cost: {},
  players: '1+',
})
