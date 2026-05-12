import { Occupation } from '../types'

const CARD_ID = 'D147_TrapBuilder'

export const D147_TrapBuilder = new Occupation({
  id: CARD_ID,
  name: 'Trap Builder',
  deck: 'D',
  number: 147,
  category: 'LIVESTOCK_PROVIDER',
  desc: ['Each time you use the __Day Laborer__ action space, place 1 <FOOD>, 1 <FOOD>, and 1 <PIG> on the next 3 round spaces, respectively. At the start of these rounds, you get the good.'],
  cost: {},
  players: '3+',
})
