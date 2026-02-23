import { MinorImprovement } from '../types'

export const C13_WoodSlideHammer = new MinorImprovement({
  id: "C13_WoodSlideHammer",
  name: "Wood Slide Hammer",
  deck: "C",
  number: 13,
  category: "FARM_PLANNER",
  desc: ["On your first renovation, if you have at least 5 wood rooms, you can renovate to stone directly and you get a discount of 2 <STONE> on the renovation cost."],
  cost: {"wood":1},
  newSet: true,
})
