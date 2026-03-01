import { MinorImprovement } from '../types'

export const D1_ZigzagHarrow = new MinorImprovement({
  id: "D1_ZigzagHarrow",
  name: "Zigzag Harrow",
  deck: "D",
  number: 1,
  category: "FARM_PLANNER",
  desc: ["Immediately plow 1 field."],
  cost: { food: 1 },
  passing: true,
})
