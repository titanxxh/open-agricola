import { MinorImprovement } from '../types'

export const A37_Bucksaw = new MinorImprovement({
  id: "A37_Bucksaw",
  name: "Bucksaw",
  deck: "A",
  number: 37,
  category: "POINTS_PROVIDER",
  desc: ["Each time you renovate, you can also pay 1 <WOOD> to get 1 bonus <SCORE> and 1 <GRAIN>."],
  cost: {"wood":1},
  newSet: true,
})
