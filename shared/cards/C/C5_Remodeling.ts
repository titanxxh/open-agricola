import { MinorImprovement } from '../types'

export const C5_Remodeling = new MinorImprovement({
  id: "C5_Remodeling",
  name: "Remodeling",
  deck: "C",
  number: 5,
  category: "BUILDING_RESOURCE_PROVIDER",
  desc: ["You immediately get 1 <CLAY> for each clay room and for each major improvement you have."],
  cost: { food: 2 },
  passing: true,
  implemented: false,
})
