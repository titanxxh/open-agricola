import { Occupation } from '../types'

const CARD_ID = 'B137_Wholesaler'

export const B137_Wholesaler = new Occupation({
  id: CARD_ID,
  name: 'Wholesaler',
  deck: 'B',
  number: 137,
  category: 'GOODS_PROVIDER',
  desc: ['Place 1 <VEGETABLE>, 1 <PIG>, 1 <STONE>, and 1 <CATTLE> on this card. Each time you use an action space card on round spaces 8 to 11, you get the corresponding good from this card.'],
  cost: {},
  players: '3+',
})
