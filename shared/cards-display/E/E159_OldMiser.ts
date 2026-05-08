import { Occupation } from '../types'

const CARD_ID = 'E159_OldMiser'

export const E159_OldMiser = new Occupation({
  id: CARD_ID,
  name: 'Old Miser',
  deck: 'E',
  number: 159,
  category: 'FOOD',
  desc: ['In the feeding phase of each harvest, each of your people requires 1\u00a0less <FOOD>. During scoring, your people are worth 2 points each instead of 3.'],
  players: '4+',
})
