import { MinorImprovement } from '../types'

export const A1_Shelter = new MinorImprovement({
  id: "A1_Shelter",
  name: "Shelter",
  deck: "A",
  number: 1,
  category: "FARM_PLANNER",
  desc: ["You can immediately build a stable at no cost, but only if you place it in a pasture covering exactly 1 farmyard space."],
  cost: { wood: 0 },
  passing: true,
})
