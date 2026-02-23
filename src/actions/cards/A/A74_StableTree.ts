import { MinorImprovement } from '../types'

export const A74_StableTree = new MinorImprovement({
  id: "A74_StableTree",
  name: "Stable Tree",
  deck: "A",
  number: 74,
  category: "BUILDING_RESOURCE_PROVIDER",
  desc: ["Each time you build 1 or more stables on your turn, place 1 <WOOD> on each of the next 3 round spaces. At the start of these rounds, you get the <WOOD>."],
  cost: {"wood":1},
})
