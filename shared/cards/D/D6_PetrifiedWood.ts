import { MinorImprovement } from '../types'
export const D6_PetrifiedWood = new MinorImprovement({
  id: "D6_PetrifiedWood",
  name: "Petrified Wood",
  deck: "D",
  number: 6,
  category: "BUILDING_RESOURCE_PROVIDER",
  desc: ["Immediately exchange up to 3 <WOOD> for 1 <STONE> each."],
  cost: {},
  passing: true,
  implemented: false,
})
