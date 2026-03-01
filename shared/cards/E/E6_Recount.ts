import { MinorImprovement } from '../types'
export const E6_Recount = new MinorImprovement({
  id: "E6_Recount",
  name: "Recount",
  deck: "E",
  number: 6,
  category: "BUILDING_RESOURCE_PROVIDER",
  desc: ["When you play this, each harvest, then get 1 additional <VP>."],
  cost: { food: 1 },
  passing: true,
})
