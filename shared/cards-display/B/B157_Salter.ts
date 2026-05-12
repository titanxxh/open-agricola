import { Occupation } from '../types'

const CARD_ID = 'B157_Salter'

export const B157_Salter = new Occupation({
  id: CARD_ID,
  name: 'Salter',
  deck: 'B',
  number: 157,
  category: 'FOOD_PROVIDER',
  desc: ['At any time, you can pay 1 <SHEEP>/<PIG>/<CATTLE> from your farm. If you do, place 1 <FOOD> on each of the next 3/5/7 round spaces. At the start of these rounds, you get the <FOOD>.'],
  cost: {},
  players: '4+',
})
