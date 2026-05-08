import { Occupation } from '../types'

const CARD_ID = 'A127_Lodger'

export const A127_Lodger = new Occupation({
  id: CARD_ID,
  name: 'Lodger',
  deck: 'A',
  number: 127,
  category: 'FARM_PLANNER',
  desc: ['This card provides room for one person, but only until the returning home phase of round 9. If, by then, there is no room elsewhere for that person, remove it from play.'],
  cost: {},
  players: '3+',
})
