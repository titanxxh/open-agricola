import { Occupation } from '../types'

const CARD_ID = 'B156_StorehouseKeeper'

export const B156_StorehouseKeeper = new Occupation({
  id: CARD_ID,
  name: 'Storehouse Keeper',
  deck: 'B',
  number: 156,
  category: 'GOODS_PROVIDER',
  desc: [
    'Each time you use the __Resource Market__ action space, you also get your choice of 1 <CLAY> or 1 <GRAIN>.',
  ],
  cost: {},
  players: '4+',
})
