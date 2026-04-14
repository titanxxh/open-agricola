import { Occupation } from '../types'

// D165 PigStalker: Each time you use an animal accumulation space, get 1 pig if you
// occupy a round space immediately adjacent (left or right) to that animal market.
// CONCERN: BGA adjacency logic depends on BGA board layout turn numbering which we
// don't have. Implemented as stub only.

export const D165_PigStalker = new Occupation({
  id: 'D165_PigStalker',
  name: 'Pig Stalker',
  deck: 'D',
  number: 165,
  category: 'LIVESTOCK_PROVIDER',
  desc: ['Each time you use an animal accumulation space, you get an additional 1 <PIG> if you occupy a Round 1-14 action space which is immediately to the left or right of that accumulation space.'],
  cost: {},
  players: '4+',
})
