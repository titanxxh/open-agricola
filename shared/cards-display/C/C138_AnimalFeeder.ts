import { Occupation } from '../types'

const CARD_ID = 'C138_AnimalFeeder'

export const C138_AnimalFeeder = new Occupation({
  id: CARD_ID,
  name: 'Animal Feeder',
  deck: 'C',
  number: 138,
  category: 'GOODS_PROVIDER',
  desc: ['On the __Day Laborer__ action space, you also get your choice of 1 <SHEEP> or 1 <GRAIN>. Instead of that good, you can buy 1 <PIG> for 1 <FOOD> or 1 <CATTLE> for 2 <FOOD>.'],
  cost: {},
  players: '3+',
})
