import { Occupation } from '../types'

const CARD_ID = 'A95_Angler'

export const A95_Angler = new Occupation({
  id: CARD_ID,
  name: 'Angler',
  deck: 'A',
  number: 95,
  category: 'ACTIONS_BOOSTER',
  desc: ['Each time after you use the __Fishing__ Accumulation space while there are at most 2 <FOOD> on that space, you get a __Major or Minor Improvement__ action.'],
  cost: {},
  players: '1+',
  newSet: true,
})
