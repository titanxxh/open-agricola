import { MinorImprovement } from '../types'

const CARD_ID = 'E38_RodCollection'

export const E38_RodCollection = new MinorImprovement({
  id: CARD_ID,
  name: "Rod Collection",
  deck: "E",
  number: 38,
  category: "BONUS_POINTS_-_GET",
  desc: ['Each time you use __Fishing__, you can place up to 2 <WOOD> on this card, irretrievably. During scoring, each such <WOOD> is worth 1 bonus <SCORE>, except the 1st, 4th, 7th, and 10th.'],
  prerequisite: '3 Occupations',
  vp: 1,
  extraVp: true,
})
