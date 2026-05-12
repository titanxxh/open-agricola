import { Occupation } from '../types'

const CARD_ID = 'B116_Shoreforester'

export const B116_Shoreforester = new Occupation({
  id: CARD_ID,
  name: 'Shoreforester',
  deck: 'B',
  number: 116,
  category: 'BUILDING_RESOURCE_PROVIDER',
  desc: [
    'When you play this card and each time 1 <REED> is placed on an empty __Reed Bank__ accumulation space in the preparation phase, you get 1 <WOOD>.',
  ],
  cost: {},
  players: '1+',
})
