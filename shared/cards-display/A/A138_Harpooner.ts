import { Occupation } from '../types'

const CARD_ID = 'A138_Harpooner'

export const A138_Harpooner = new Occupation({
  id: CARD_ID,
  name: 'Harpooner',
  deck: 'A',
  number: 138,
  category: 'GOODS_PROVIDER',
  desc: ['Each time you use the __Fishing__ space you can also pay 1 <WOOD> to get 1 <FOOD> for each person you have, and 1 <REED>'],
  cost: {},
  players: '3+',
  waresSalesmanGains: [{ wood: 1, reed: 1 }],
})
