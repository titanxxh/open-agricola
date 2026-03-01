import { MinorImprovement } from '../types'
export const D5_FieldClay = new MinorImprovement({
  id: "D5_FieldClay",
  name: "Field Clay",
  deck: "D",
  number: 5,
  category: "BUILDING_RESOURCE_PROVIDER",
  desc: ["Immediately get 1 <CLAY> for each field you have."],
  cost: {},
  passing: true,
})
