import { MinorImprovement } from '../types'

const CARD_ID = 'D32_WoodRake'

export const D32_WoodRake = new MinorImprovement({
  id: CARD_ID,
  name: "Wood Rake",
  deck: "D",
  number: 32,
  category: "POINTS_PROVIDER",
  desc: ["During scoring, if you had at least 7 goods in your fields before the final harvest, you get 2 bonus <SCORE>."],
  cost: { wood: 1 },
})
