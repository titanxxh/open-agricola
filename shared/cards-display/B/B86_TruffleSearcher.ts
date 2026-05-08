import { Occupation } from '../types'

const CARD_ID = 'B86_TruffleSearcher'

export const B86_TruffleSearcher = new Occupation({
  id: CARD_ID,
  name: 'Truffle Searcher',
  deck: 'B',
  number: 86,
  category: 'FARM_PLANNER',
  desc: ['This card can hold a number of <PIG> equal to the number of completed feeding phases.'],
  cost: {},
  players: '1+',
  newSet: true,
})
