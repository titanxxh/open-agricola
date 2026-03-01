import { MinorImprovement } from '../types'

export const A6_StorageBarn = new MinorImprovement({
  id: "A6_StorageBarn",
  name: "Storage Barn",
  deck: "A",
  number: 6,
  category: "BUILDING_RESOURCE_PROVIDER",
  desc: ["If you have the Well, Joinery, Pottery, and/or Basketmaker's Workshop, you immediately get 1 <STONE>, 1 <WOOD>, 1 <CLAY>, and/or 1 <REED>, respectively."],
  cost: {},
  passing: true,
  implemented: false,
})
