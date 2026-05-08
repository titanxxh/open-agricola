import { Occupation } from '../types'

const CARD_ID = 'A125_Priest'

export const A125_Priest = new Occupation({
  id: CARD_ID,
  name: 'Priest',
  deck: 'A',
  number: 125,
  category: 'BUILDING_RESOURCE_PROVIDER',
  desc: ['When you play this card, if you live in a clay house with exactly 2 rooms, you immediately get 3 <CLAY>, 2 <REED> and 2 <STONE>.'],
  cost: {},
  players: '1+',
})
