import { Occupation } from '../types'

const CARD_ID = 'D106_WhiskyDistiller'

export const D106_WhiskyDistiller = new Occupation({
  id: CARD_ID,
  name: 'Whisky Distiller',
  deck: 'D',
  number: 106,
  category: 'FOOD_PROVIDER',
  desc: ['At any time, you can pay 1 <GRAIN>. If you do, add 2 to the current round and place 4 <FOOD> on the corresponding round space. At the start of that round, you get the <FOOD>.'],
  cost: {},
  players: '1+',
  newSet: true,
})
