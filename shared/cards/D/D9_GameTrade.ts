import { MinorImprovement } from '../types'
export const D9_GameTrade = new MinorImprovement({
  id: "D9_GameTrade",
  name: "Game Trade",
  deck: "D",
  number: 9,
  category: "BUILDING_RESOURCE_PROVIDER",
  desc: ["You may trade resources with your neighbors. For each resource, the neighbor's board has at least 1 more of this resource than you1 of your supply, you you get 1 additional <FOOD>."],
  cost: { food: 2 },
  passing: true,
})
