import { Occupation } from '../types'

const CARD_ID = 'E93_Motivator'

export const E93_Motivator = new Occupation({
  id: CARD_ID,
  name: 'Motivator',
  deck: 'E',
  number: 93,
  desc: ['On your first turn each round, if you have no unused farmyard spaces, you can place a person from your supply.'],
  cost: {},
  players: '1+',
  category: 'ACTION_-_GUEST',
})
