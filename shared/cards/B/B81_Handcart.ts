import { MinorImprovement } from '../types'

export const B81_Handcart = new MinorImprovement({
  id: "B81_Handcart",
  name: "Handcart",
  deck: "B",
  number: 81,
  category: "BUILDING_RESOURCE_PROVIDER",
  desc: ["Before each work phase, you can take 1 building resource from at most one <WOOD>/<CLAY>/<REED>/<STONE> accumulation space containing at least 6/5/4/4 building resources of the same type."],
  cost: {"wood":1},
})
