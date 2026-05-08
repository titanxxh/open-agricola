import { Occupation } from '../types'

const CARD_ID = 'A124_Knapper'

export const A124_Knapper = new Occupation({
  id: CARD_ID,
  name: 'Knapper',
  deck: 'A',
  number: 124,
  category: 'BUILDING_RESOURCE_PROVIDER',
  desc: [
    'Each time before you use an action space card on round spaces 5 to 7, you get 1 <STONE>.',
  ],
  cost: {},
  players: '1+',
  newSet: true,
})
