import { Occupation } from '../types'

const CARD_ID = 'A117_WoodCarrier'

export const A117_WoodCarrier = new Occupation({
  id: CARD_ID,
  name: 'Wood Carrier',
  deck: 'A',
  number: 117,
  category: 'BUILDING_RESOURCE_PROVIDER',
  desc: ['When you play this card, you immediately get 1 <WOOD> for each improvement in front of you.'],
  cost: {},
  players: '1+',
  newSet: true,
})
