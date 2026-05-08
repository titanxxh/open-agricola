import { Occupation } from '../types'

const CARD_ID = 'B105_CaseBuilder'

export const B105_CaseBuilder = new Occupation({
  id: CARD_ID,
  name: 'Case Builder',
  deck: 'B',
  number: 105,
  category: 'GOODS_PROVIDER',
  desc: ['When you play this card, you immediately get 1 good of each of the following types, if you have at least 2 of that good in your supply already: <FOOD>, <GRAIN>, <VEGETABLE>, <REED>, <WOOD>.'],
  cost: {},
  players: '1+',
})
