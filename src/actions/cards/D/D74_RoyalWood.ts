import { MinorImprovement } from '../types'

export const D74_RoyalWood = new MinorImprovement({
  id: "D74_RoyalWood",
  name: "Royal Wood",
  deck: "D",
  number: 74,
  category: "BUILDING_RESOURCE_PROVIDER",
  desc: ["At the end of each turn in which you use the __Farm Expansion__ action space or build an improvement, you get 1 <WOOD> back for every 2 <WOOD> paid during those actions (rounded down)."],
  cost: {},
})
