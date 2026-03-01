import { MinorImprovement } from '../types'

export const A2_ShiftingCultivation = new MinorImprovement({
  id: "A2_ShiftingCultivation",
  name: "Shifting Cultivation",
  deck: "A",
  number: 2,
  category: "FARM_PLANNER",
  desc: ["Immediately plow 1 field."],
  cost: { food: 2 },
  passing: true,
})
