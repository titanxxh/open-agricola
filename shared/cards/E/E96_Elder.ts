import { Occupation } from '../types'

export const E96_Elder = new Occupation({
  id: 'E96_Elder',
  name: 'Elder',
  deck: 'E',
  number: 96,
  category: 'ACTION_SPACE_EXTENDER',
  desc: ['You can play this card at the start of the work phase of round 1 without placing a person. (This card has no effect other than counting as a played occupation.)'],
  cost: {},
  players: '1+',
})
