import { MinorImprovement } from '../types'

export const C2_Stable = new MinorImprovement({
  id: "C2_Stable",
  name: "Stable",
  deck: "C",
  number: 2,
  category: "FARM_PLANNER",
  desc: ["Immediately build 1 stable for free."],
  cost: { food: 2 },
  passing: true,
})
