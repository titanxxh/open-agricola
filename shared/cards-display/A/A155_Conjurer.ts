import { Occupation } from '../types'

const CARD_ID = 'A155_Conjurer'

export const A155_Conjurer = new Occupation({
  id: CARD_ID,
  name: 'Conjurer',
  deck: 'A',
  number: 155,
  category: 'GOODS_PROVIDER',
  desc: ['Each time you use the __Traveling Players__ accumulation space, you get an additional 1 <WOOD> and 1 <GRAIN>.'],
  cost: {},
  players: '4+',
})
