import { MinorImprovement } from '../types'

const CARD_ID = 'B79_Corf'

export const B79_Corf = new MinorImprovement({
  id: CARD_ID,
  name: 'Corf',
  deck: 'B',
  number: 79,
  category: 'BUILDING_RESOURCE_PROVIDER',
  desc: [
    'Each time any player (including you) takes at least 3 <STONE> from an accumulation space, you get 1 <STONE> from the general supply.',
  ],
  cost: { reed: 1 },
})
