import { Occupation } from '../types'

const CARD_ID = 'E130_Overachiever'

export const E130_Overachiever = new Occupation({
  id: CARD_ID,
  name: "Overachiever",
  deck: "E",
  number: 130,
  category: "ACTION_-_IMPROVEMENTS_OR_OCCUPATIONS",
  desc: ['Each time you use a __Wish for Children__ action space, you can play 1 additional improvement by paying its cost minus 1 resource of your choice.'],
  cost: {},
  players: "3+",
})
