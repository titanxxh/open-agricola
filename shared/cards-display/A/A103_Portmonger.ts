import { Occupation } from '../types'

const CARD_ID = 'A103_Portmonger'

export const A103_Portmonger = new Occupation({
  id: CARD_ID,
  name: 'Portmonger',
  deck: 'A',
  number: 103,
  category: 'GOODS_PROVIDER',
  desc: ['Each time you take 1/2/3+ <FOOD> from a food accumulation space, you also get 1 <VEGETABLE>/<GRAIN>/<REED>.'],
  cost: {},
  players: '1+',
  newSet: true,
})
