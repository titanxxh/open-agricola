import { MinorImprovement } from '../types'

export const D14_HammerCrusher = new MinorImprovement({
  id: "D14_HammerCrusher",
  name: "Hammer Crusher",
  deck: "D",
  number: 14,
  category: "FARM_PLANNER",
  desc: ["Immediately before you renovate to stone, you get 2 <CLAY> and 1 <REED> and you can take a __Build Rooms__ action."],
  cost: {"wood":1},
})
