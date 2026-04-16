import { Occupation } from '../types'

export const C105_BasketCarrier = new Occupation({
  id: 'C105_BasketCarrier',
  name: 'Basket Carrier',
  deck: 'C',
  number: 105,
  category: 'GOODS_PROVIDER',
  desc: ['Once each harvest, you can buy 1 <WOOD>, 1 <REED>, and 1 <GRAIN> for 2 <FOOD> total.'],
  cost: {},
  players: '1+',
})
