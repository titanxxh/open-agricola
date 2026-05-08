import { Occupation } from '../types'

const CARD_ID = 'E106_EmergencySeller'

export const E106_EmergencySeller = new Occupation({
  id: CARD_ID,
  name: 'Emergency Seller',
  deck: 'E',
  number: 106,
  category: 'FOOD',
  desc: [
    'When you play this card, you can immediately turn as many building resources into food as you have people:',
    '<WOOD>/<CLAY> <ARROW> 2 <FOOD>',
    '<REED>/<STONE> <ARROW> 3 <FOOD>',
  ],
  players: '1+',
})
