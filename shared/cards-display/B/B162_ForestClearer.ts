import { Occupation } from '../types'

const CARD_ID = 'B162_ForestClearer'

export const B162_ForestClearer = new Occupation({
  id: CARD_ID,
  name: 'Forest Clearer',
  deck: 'B',
  number: 162,
  category: 'BUILDING_RESOURCE_PROVIDER',
  desc: [
    'Each time you obtain exactly 2/3/4 <WOOD> from a wood accumulation space, you get 1 additional <WOOD> and 1/0/1 <FOOD>.',
  ],
  cost: {},
  players: '4+',
  evenMoreSet: true,
})
