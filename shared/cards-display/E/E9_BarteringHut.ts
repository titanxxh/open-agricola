import { MinorImprovement } from '../types'

const CARD_ID = 'E9_BarteringHut'

export const E9_BarteringHut = new MinorImprovement({
  id: CARD_ID,
  name: 'Bartering Hut',
  deck: 'E',
  number: 9,
  category: 'PASSING_-_ANIMAL',
  desc: ['Up to two times: Immediately spend any 2/3/4 building resources for 1 <SHEEP>/<PIG>/<CATTLE> from the general supply.'],
  passing: true,
})
