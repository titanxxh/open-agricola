import { Occupation } from '../types'

const CARD_ID = 'B127_Seducer'

export const B127_Seducer = new Occupation({
  id: CARD_ID,
  name: 'Seducer',
  deck: 'B',
  number: 127,
  category: 'FARM_PLANNER',
  desc: ['When you play this card in round 5 or later, you can immediately pay 1 <STONE>, 1 <GRAIN>, 1 <VEGETABLE>, and 1 <SHEEP> to take a __Family Growth Even without Room__ action.'],
  cost: {},
  players: '3+',
})
