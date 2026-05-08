import { Occupation } from '../types'

const CARD_ID = 'D122_ClayCarrier'

export const D122_ClayCarrier = new Occupation({
  id: CARD_ID,
  name: 'Clay Carrier',
  deck: 'D',
  number: 122,
  category: 'BUILDING_RESOURCE_PROVIDER',
  desc: ['When you play this card, you immediately get 2 <CLAY>. At any time, but only once per round, you can buy 2 <CLAY> for 2 <FOOD>.'],
  cost: {},
  players: '1+',
})
