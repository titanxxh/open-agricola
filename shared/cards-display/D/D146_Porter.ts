import { Occupation } from '../types'

const CARD_ID = 'D146_Porter'

export const D146_Porter = new Occupation({
  id: CARD_ID,
  name: 'Porter',
  deck: 'D',
  number: 146,
  category: 'BUILDING_RESOURCE_PROVIDER',
  desc: [
    'Each time you take at least 4 of the same building resource from an accumulation space, you get 1 additional building resource of the accumulating type and 1 <FOOD>',
  ],
  cost: {},
  players: '3+',
  implemented: true,
})
