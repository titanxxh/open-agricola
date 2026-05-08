import { MinorImprovement } from '../types'

const CARD_ID = 'A32_Manger'

export const A32_Manger = new MinorImprovement({
  id: CARD_ID,
  name: "Manger",
  deck: "A",
  number: 32,
  category: "POINTS_PROVIDER",
  desc: ["During scoring, if your pastures cover at least 6/7/8/10 farmyard spaces, you get 1/2/3/4 bonus <SCORE>."],
  cost: { wood: 2 },
  extraVp: true,
})
