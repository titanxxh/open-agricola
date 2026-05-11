import { MinorImprovement } from '../types'

const CARD_ID = 'D37_Sculpture'

export const D37_Sculpture = new MinorImprovement({
  id: CARD_ID,
  name: 'Sculpture',
  deck: 'D',
  number: 37,
  category: 'POINTS_PROVIDER',
  desc: ['You can only play this card if there are more complete rounds left to play than you have unused farmyard spaces.'],
  cost: { stone: 1 },
  vp: 2,
  prerequisite: 'see below',
})
