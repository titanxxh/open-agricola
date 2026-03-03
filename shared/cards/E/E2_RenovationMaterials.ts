import { MinorImprovement } from '../types'
export const E2_RenovationMaterials = new MinorImprovement({
  id: "E2_RenovationMaterials",
  name: "Renovation Materials",
  deck: "E",
  number: 2,
  category: "BUILDING_RESOURCE_PROVIDER",
  desc: ["Immediately renovate to clay at no cost. (You must pay the cost of this card though.)"],
  cost: { food: 2 },
  passing: true,
  implemented: false,
})
