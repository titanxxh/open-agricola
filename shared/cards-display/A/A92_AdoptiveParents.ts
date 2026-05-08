import { Occupation } from '../types'

const CARD_ID = 'A92_AdoptiveParents'

export const A92_AdoptiveParents = new Occupation({
  id: CARD_ID,
  name: 'Adoptive Parents',
  deck: 'A',
  number: 92,
  category: 'ACTIONS_BOOSTER',
  desc: ['For 1 <FOOD>, you can take an action with offspring in the same round you get it. If you do, the offspring does not count as "newborn".'],
  cost: {},
  players: '1+',
})
