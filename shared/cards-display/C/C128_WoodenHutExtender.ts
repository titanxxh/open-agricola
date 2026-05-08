import { Occupation } from '../types'

const CARD_ID = 'C128_WoodenHutExtender'

export const C128_WoodenHutExtender = new Occupation({
  id: CARD_ID,
  name: 'Wooden Hut Extender',
  deck: 'C',
  number: 128,
  category: 'FARM_PLANNER',
  desc: ['Wood rooms now cost you 1 <REED>, and additionally 5 <WOOD> through round 5, 4 <WOOD> in rounds 6 and 7, and 3 <WOOD> in round 8 and later.'],
  cost: {},
  players: '3+',
})
