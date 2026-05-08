import { MinorImprovement } from '../types'

const CARD_ID = 'A38_WoolBlankets'

export const A38_WoolBlankets = new MinorImprovement({
  id: CARD_ID,
  name: "Wool Blankets",
  deck: "A",
  number: 38,
  category: "POINTS_PROVIDER",
  desc: ["During scoring, if you live in a wooden/clay/stone house by then, you get 3/2/0 bonus <SCORE>."],
  cost: {},
  prerequisite: "5 Sheep",
  extraVp: true,
})
