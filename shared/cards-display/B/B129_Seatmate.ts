import { Occupation } from '../types'

const CARD_ID = 'B129_Seatmate'

export const B129_Seatmate = new Occupation({
  id: CARD_ID,
  name: 'Seatmate',
  deck: 'B',
  number: 129,
  category: 'ACTIONS_BOOSTER',
  desc: ['You can use the action space on round space 13 even if it is occupied by one or more people of the players to your immediate left and right.'],
  cost: {},
  players: '3+',
})
