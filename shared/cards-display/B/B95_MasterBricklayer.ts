import { Occupation } from '../types'

const CARD_ID = 'B95_MasterBricklayer'

export const B95_MasterBricklayer = new Occupation({
  id: CARD_ID,
  name: 'Master Bricklayer',
  deck: 'B',
  number: 95,
  category: 'ACTIONS_BOOSTER',
  desc: ['Each time you build a major improvement, reduce the <STONE> cost by the number of rooms you have built onto your initial house.'],
  cost: {},
  players: '1+',
})
