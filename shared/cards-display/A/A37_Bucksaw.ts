import { MinorImprovement } from '../types'

const CARD_ID = 'A37_Bucksaw'

export const A37_Bucksaw = new MinorImprovement({
  id: CARD_ID,
  name: "Bucksaw",
  deck: "A",
  number: 37,
  category: "POINTS_PROVIDER",
  desc: ["Each time you renovate, you can also pay 1 <WOOD> to get 1 bonus <SCORE> and 1 <GRAIN>."],
  cost: {"wood":1},
  newSet: true,
  extraVp: true,
})
