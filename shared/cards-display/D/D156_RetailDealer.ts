import { Occupation } from '../types'

const CARD_ID = 'D156_RetailDealer'

export const D156_RetailDealer = new Occupation({
  id: CARD_ID,
  name: 'Retail Dealer',
  deck: 'D',
  number: 156,
  category: 'GOODS_PROVIDER',
  desc: ['Place 3 <GRAIN> and 3 <FOOD> on this card. Each time you use the __Resource Market__ action space, you also get 1 <GRAIN> and 1 <FOOD> from this card.'],
  cost: {},
  players: '4+',
})
