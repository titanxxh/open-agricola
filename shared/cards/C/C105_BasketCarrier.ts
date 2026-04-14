import { Occupation } from '../types'

export const C105_BasketCarrier = new Occupation({
  id: 'C105_BasketCarrier',
  name: 'Basket Carrier',
  deck: 'C',
  number: 105,
  category: 'GOODS_PROVIDER',
  desc: ['Once each harvest, you can buy 1 wood, 1 reed, and 1 grain for 2 food total.'],
  cost: {},
  players: '1+',
})
