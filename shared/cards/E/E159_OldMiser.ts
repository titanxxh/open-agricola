import { Occupation } from '../types'
// BGA: onBuy triggers a harvest cost notification and score recompute.
// Main effects (feeding cost reduction, family scoring change) are in harvest/scoring logic.
// TODO: implement -1 food per person in feeding phase and 2 pts/person in scoring.

export const E159_OldMiser = new Occupation({
  id: 'E159_OldMiser',
  name: 'Old Miser',
  deck: 'E',
  number: 159,
  category: 'FOOD_MISC',
  desc: ['In the feeding phase of each harvest, each of your people requires 1 less <FOOD>. During scoring, your people are worth 2 points each instead of 3.'],
  players: '4+',
})
