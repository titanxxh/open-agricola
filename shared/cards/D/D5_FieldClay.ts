import { MinorImprovement } from '../types'
export const D5_FieldClay = new MinorImprovement({
  id: "D5_FieldClay",
  name: "Field Clay",
  deck: "D",
  number: 5,
  category: "BUILDING_RESOURCE_PROVIDER",
  desc: ["You immediately get 1 <CLAY> for each planted field you have."],
  cost: {},
  passing: true,
  implemented: false,
})
