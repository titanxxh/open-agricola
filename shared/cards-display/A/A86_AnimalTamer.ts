import { Occupation } from '../types'

const CARD_ID = 'A86_AnimalTamer'

export const A86_AnimalTamer = new Occupation({
  id: CARD_ID,
  name: 'Animal Tamer',
  deck: 'A',
  number: 86,
  category: 'FARM_PLANNER',
  desc: ['When you play this card, you immediately get your choice of 1 <WOOD> or 1 <GRAIN>. Instead of just 1 animal total, you can keep any 1 animal in each room of your house.'],
  cost: {},
  players: '1+',
})
