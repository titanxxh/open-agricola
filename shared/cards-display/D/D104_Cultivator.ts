import { Occupation } from '../types'

const CARD_ID = 'D104_Cultivator'

export const D104_Cultivator = new Occupation({
  id: CARD_ID,
  name: 'Cultivator',
  deck: 'D',
  number: 104,
  category: 'GOODS_PROVIDER',
  desc: ['For each new field tile you get, you also get 1 <WOOD> and 1 <FOOD>.'],
  cost: {},
  players: '1+',
})
