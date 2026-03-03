import { MinorImprovement } from '../types'

export const D2_DwellingPlan = new MinorImprovement({
  id: "D2_DwellingPlan",
  name: "Dwelling Plan",
  deck: "D",
  number: 2,
  category: "FARM_PLANNER",
  desc: ["You can immediately take a __Renovation__ action."],
  cost: {},
  passing: true,
  implemented: false,
})
