import { MinorImprovement } from '../types'
export const E2_RenovationMaterials = new MinorImprovement({
  id: "E2_RenovationMaterials",
  name: "Renovation Materials",
  deck: "E",
  number: 2,
  category: "BUILDING_RESOURCE_PROVIDER",
  desc: ["Immediately get 1 <WOOD> and 1 <REED> for each room of your house."],
  cost: { food: 2 },
  passing: true,
})
