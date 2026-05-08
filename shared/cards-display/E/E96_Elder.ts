import { Occupation } from '../types'

const CARD_ID = 'E96_Elder'

export const E96_Elder = new Occupation({
  id: CARD_ID,
  name: 'Elder',
  deck: 'E',
  number: 96,
  category: 'ACTION_-_IMPROVEMENT',
  desc: ['You can play this card at the start of the work phase of round 1 without placing a person. (This card has no effect other than counting as a played occupation.)'],
  cost: {},
  players: '1+',
})
