import { Occupation } from '../types'

const CARD_ID = 'C103_GreenGrocer'

export const C103_GreenGrocer = new Occupation({
  id: CARD_ID,
  name: 'Green Grocer',
  deck: 'C',
  number: 103,
  category: 'GOODS_PROVIDER',
  desc: ['At the start of each round, you can make exactly one of the following exchanges: 1 <CATTLE> <ARROW> 1 <VEGETABLE>; 1 <VEGETABLE> <ARROW> 1 <CATTLE>; 2 <SHEEP> <ARROW> 1 <VEGETABLE>; 1 <VEGETABLE> <ARROW> 2 <SHEEP>; 2 <FOOD> <ARROW> 1 <GRAIN>; 1 <GRAIN> <ARROW> 2 <FOOD>'],
  cost: {},
  players: '1+',
  newSet: true,
})
