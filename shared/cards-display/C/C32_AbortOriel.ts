import { MinorImprovement } from '../types'

const CARD_ID = 'C32_AbortOriel'

export const C32_AbortOriel = new MinorImprovement({
  id: CARD_ID,
  name: 'Abort Oriel',
  deck: 'C',
  number: 32,
  category: 'POINTS_PROVIDER',
  desc: ['You can no longer play this card when any player (including you) has 5 or more cards in front of them.'],
  cost: { clay: 2 },
  vp: 3,
  prerequisite: 'see below',
  newSet: true,
})
