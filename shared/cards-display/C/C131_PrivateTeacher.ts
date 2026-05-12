import { Occupation } from '../types'

const CARD_ID = 'C131_PrivateTeacher'

export const C131_PrivateTeacher = new Occupation({
  id: CARD_ID,
  name: 'Private Teacher',
  deck: 'C',
  number: 131,
  category: 'ACTIONS_BOOSTER',
  desc: ['Each time you use the __Grain Seeds__ action space when any __Lessons__ action space is occupied, you can also play an occupation for an occupation cost of 1 <FOOD>.'],
  cost: {},
  players: '3+',
})
