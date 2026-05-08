import { Occupation } from '../types'

const CARD_ID = 'B96_TreeFarmJoiner'

export const B96_TreeFarmJoiner = new Occupation({
  id: CARD_ID,
  name: 'Tree Farm Joiner',
  deck: 'B',
  number: 96,
  category: 'ACTIONS_BOOSTER',
  desc: ['Place 1 <WOOD> on each of the next 2 odd-numbered round spaces. At the start of these rounds, you get the <WOOD> and, immediately afterward, a __Minor Improvement__ action.'],
  cost: {},
  players: '1+',
})
