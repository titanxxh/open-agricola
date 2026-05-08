import { Occupation } from '../types'

const CARD_ID = 'B119_Lumberjack'

export const B119_Lumberjack = new Occupation({
  id: CARD_ID,
  name: 'Lumberjack',
  deck: 'B',
  number: 119,
  category: 'BUILDING_RESOURCE_PROVIDER',
  desc: ['You immediately get 1 <WOOD>. Additionally, place 1 <WOOD> on each of the next round spaces, up to the number of fences you built. At the start of these rounds, you get the <WOOD>.'],
  cost: {},
  players: '1+',
})
