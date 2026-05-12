import { MinorImprovement } from '../types'

const CARD_ID = 'E35_Misanthropy'

export const E35_Misanthropy = new MinorImprovement({
  id: CARD_ID,
  name: "Misanthropy",
  deck: "E",
  number: 35,
  category: "BONUS_POINTS_-_GET",
  desc: ['During scoring, if you have exactly 4/3/2 people, you get 2/3/5 bonus <SCORE>.'],
  cost: {},
  vp: 0,
  extraVp: true,
})
