import { MinorImprovement } from '../types'

const CARD_ID = 'D33_SummerHouse'

export const D33_SummerHouse = new MinorImprovement({
  id: CARD_ID,
  name: "Summer House",
  deck: "D",
  number: 33,
  category: "POINTS_PROVIDER",
  desc: [
    'During scoring, if you live in a stone house, you get 2 bonus <SCORE> for each unused farmyard space orthogonally adjacent to your house. (You still lose the points for these unused spaces.)',
  ],
  cost: { wood: 3, stone: 1 },
  prerequisite: "Still in Wooden House",
  extraVp: true,
})
