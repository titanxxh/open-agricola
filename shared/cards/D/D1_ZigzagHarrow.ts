import { MinorImprovement } from '../types'

export const D1_ZigzagHarrow = new MinorImprovement({
  id: "D1_ZigzagHarrow",
  name: "Zigzag Harrow",
  deck: "D",
  number: 1,
  category: "FARM_PLANNER",
  desc: ["You can immediately plow 1 field such that it completes a \"zigzag\" pattern."],
  cost: { food: 1 },
  passing: true,
  implemented: false,
})
