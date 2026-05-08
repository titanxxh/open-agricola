import { Occupation } from '../types'

const CARD_ID = 'A102_Grocer'

export const A102_Grocer = new Occupation({
  id: CARD_ID,
  name: 'Grocer',
  deck: 'A',
  number: 102,
  category: 'GOODS_PROVIDER',
  desc: ['Pile the following goods on this card (<WOOD>, <GRAIN>, <REED>, <STONE>, <VEGETABLE>, <CLAY>, <REED>, <VEGETABLE>). At any time, you can buy the top good for 1 <FOOD>.'],
  cost: {},
  players: '1+',
})
