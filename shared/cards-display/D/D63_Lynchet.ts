import { MinorImprovement } from '../types'

const CARD_ID = 'D63_Lynchet'

export const D63_Lynchet = new MinorImprovement({
  id: CARD_ID,
  name: 'Lynchet',
  deck: 'D',
  number: 63,
  category: 'FOOD_PROVIDER',
  desc: [
    'In the field phase of each harvest, you get 1 <FOOD> for each harvested field tile that is orthogonally adjacent to your house.',
  ],
  cost: {},
  evenMoreSet: true,
})
