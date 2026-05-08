import { Occupation } from '../types'

const CARD_ID = 'D105_Sculptor'

export const D105_Sculptor = new Occupation({
  id: CARD_ID,
  name: 'Sculptor',
  deck: 'D',
  number: 105,
  category: 'GOODS_PROVIDER',
  desc: ['Each time you use a clay accumulation space, you also get 1 <FOOD>. Each time you use a stone accumulation space, you also get 1 <GRAIN>.'],
  cost: {},
  players: '1+',
  newSet: true,
})
