import { MinorImprovement } from '../types'

const CARD_ID = 'B38_FutureBuildingSite'

export const B38_FutureBuildingSite = new MinorImprovement({
  id: CARD_ID,
  name: 'Future Building Site',
  deck: 'B',
  number: 38,
  category: 'POINTS_PROVIDER',
  desc: [
    'Up until all other farmyard spaces are used, you cannot use the unused spaces that are orthogonally adjacent to your house (not even to build rooms).',
  ],
  cost: {},
  vp: 3,
  maxRound: 4,
  prerequisite: 'Play in Round 4 or Before',
  implemented: true,
})
