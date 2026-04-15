import { MinorImprovement } from '../types'

export const C32_AbortOriel = new MinorImprovement({
  id: 'C32_AbortOriel',
  name: 'Abort Oriel',
  deck: 'C',
  number: 32,
  category: 'POINTS_PROVIDER',
  desc: ['You can no longer play this card when any player (including you) has 5 or more cards in front of them.'],
  cost: { clay: 2 },
  vp: 3,
  prerequisite: 'see below',
})
