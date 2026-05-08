import { Occupation } from '../types'

const CARD_ID = 'D118_Bonehead'

export const D118_Bonehead = new Occupation({
  id: CARD_ID,
  name: 'Bonehead',
  deck: 'D',
  number: 118,
  category: 'BUILDING_RESOURCE_PROVIDER',
  desc: ['When you play this card, immediately place 6 <WOOD> on it. Immediately after each time you play a card from your hand, including this one, you get 1 <WOOD> from this card.'],
  cost: {},
  players: '1+',
})
