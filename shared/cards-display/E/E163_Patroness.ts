import { Occupation } from '../types'

const CARD_ID = 'E163_Patroness'

export const E163_Patroness = new Occupation({
  id: CARD_ID,
  name: 'Patroness',
  deck: 'E',
  number: 163,
  category: 'BUILDING_RESOURCES',
  desc: [
    'Each time after you play an occupation after this one, you get 1 building resource of your choice.',
  ],
  cost: {},
  players: '4+',
})
