import { MinorImprovement } from '../types'
export const D6_PetrifiedWood = new MinorImprovement({
  id: "D6_PetrifiedWood",
  name: "Petrified Wood",
  deck: "D",
  number: 6,
  category: "BUILDING_RESOURCE_PROVIDER",
  desc: ["You immediately get 1 <WOOD> for each 3 <WOOD> in your supply."],
  cost: {},
  passing: true,
})
