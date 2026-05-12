import { MinorImprovement } from '../types'

const CARD_ID = 'B34_SpecialFood'

export const B34_SpecialFood = new MinorImprovement({
  id: CARD_ID,
  name: "Special Food",
  deck: "B",
  number: 34,
  category: "POINTS_PROVIDER",
  desc: ["The next time you take animals from an accumulation space and accommodate all of them on your farm, you get 1 bonus <SCORE> for each of these animals."],
  cost: {},
  prerequisite: "No Animal",
  extraVp: true,
})
