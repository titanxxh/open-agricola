import { MinorImprovement } from '../types'

const CARD_ID = 'E28_Bookmark'

export const E28_Bookmark = new MinorImprovement({
  id: CARD_ID,
  name: 'Bookmark',
  deck: 'E',
  number: 28,
  desc: ['Add 3 to the current round and mark the corresponding round space. At the start of that round, you can play 1 occupation without paying an occupation cost.'],
  cost: { wood: 1 },
  category: 'ACTION_-_OCCUPATION',
})
