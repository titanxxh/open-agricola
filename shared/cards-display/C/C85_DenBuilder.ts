import { Occupation } from '../types'

const CARD_ID = 'C85_DenBuilder'

export const C85_DenBuilder = new Occupation({
  id: CARD_ID,
  name: 'Den Builder',
  deck: 'C',
  number: 85,
  category: 'FARM_PLANNER',
  desc: ['When you live in a clay or stone house, you can pay 1 <GRAIN> and 2 <FOOD>. If you do, for the rest of the game, this card provides room for exactly one person.'],
  cost: {},
  players: '1+',
  implemented: true,
})
