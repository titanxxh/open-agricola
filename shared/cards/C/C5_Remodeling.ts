import { MinorImprovement } from '../types'

export const C5_Remodeling = new MinorImprovement({
  id: "C5_Remodeling",
  name: "Remodeling",
  deck: "C",
  number: 5,
  category: "BUILDING_RESOURCE_PROVIDER",
  desc: ["You immediately get 1 <WOOD> and 1 <CLAY> for each room you have."],
  cost: { food: 2 },
  passing: true,
})
