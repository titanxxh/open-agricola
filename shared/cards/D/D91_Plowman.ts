import { Occupation } from '../types'

const CARD_ID = 'D91_Plowman'

// BGA: Add 4, 7, and 10 to the current round and place a field tile on each corresponding round space.
// At the start of these rounds, you can plow the field for 1 FOOD.
// TODO: "pay-to-receive" future meeples (FIELDPLUS) not yet supported in TS engine.

export const D91_Plowman = new Occupation({
  id: CARD_ID,
  name: 'Plowman',
  deck: 'D',
  number: 91,
  category: 'FARM_PLANNER',
  desc: ['Add 4, 7, and 10 to the current round and place a field tile on each corresponding round space. At the start of these rounds, you can plow the field for 1 <FOOD>.'],
  cost: {},
  players: '1+',
})
